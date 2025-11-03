const Router = require("@koa/router");
const { sendPurchaseRequest, sendValidationResult } = require("../../broker/mqttClient");
const { enqueueRecommendationJob } = require('../services/jobsClient');
const { getUfValue } = require("../utils/uf");
// agregados minimos para RF03
const { randomUUID } = require('crypto');
const authenticate = require('../middlewares/authenticate');
const { tx } = require('../utils/transactions.js');
const { send } = require("process");
const axios = require("axios");
const LAMBDA_URL = process.env.BOLETAS_LAMBDA_URL;

// Para idempotencia (validar UUIDs)
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isUuid = (value) => UUID_REGEX.test(String(value || ""));

const router = new Router();

// Endpoint para crear una solicitud de compra (ahora autenticado)
router.post("create.transaction", "/transaction", authenticate, async (ctx) => {
  try {
    const { property_url } = ctx.request.body;
    if (!property_url) {

      ctx.body = { error: "property_url es requerido" };
      ctx.status = 400;
      return;
    }

    // 1. Verificar que la propiedad existe y tiene offers disponibles
    const property = await ctx.orm.Propertie.findOne({ where: { url: property_url } });
    if (!property) {
      ctx.body = { error: "Propiedad no encontrada" };
      ctx.status = 404;
      return;
    }

    const offersNum = Number(property.offers || 0);
    if (!Number.isFinite(offersNum) || offersNum <= 0) {
      ctx.body = {
        error: "No hay visitas disponibles para esta propiedad",
        available_offers: property.offers
      };
      ctx.status = 409; // Conflict
      return;
    }
    let priceNum;
    if (property.currency == "UF"){
      const ufValue = await getUfValue();
      priceNum = Number(property.price) * ufValue * 0.1;
      console.log("Precio en CLP calculado desde UF:", priceNum);
    }
    else{
      priceNum = Number(property.price) * 0.1;
    }

    const request_id = randomUUID();
    const trx = await tx.create(String(property.id), "g11-business", Math.round(priceNum, 0), `${process.env?.FRONT_URL}/completed-purchase?property_id=${property.id}&request_id=${request_id}` || `http://localhost:5173/completed-purchase?property_id=${property.id}&request_id=${request_id}`);


    sendPurchaseRequest(property_url, request_id, trx.token);

    ctx.body = {
      message: "Solicitud de compra enviada",
      property_url: property_url,
      property_name: property.name,
      available_offers: property.offers,
      status: "pending",
      deposit_token : trx.token,
      deposit_url : trx.url,
    };
    ctx.status = 201;

  } catch (error) {
    console.error("Error en solicitud de compra:", error);
    ctx.body = { error: "Error interno del servidor" };
    ctx.status = 500;
  }
});

router.post("create.intent.purchase", "/create-intent", authenticate, async (ctx) => {
  try {
    const { property_url, property_id } = ctx.request.body || {};

    if (!property_url && !property_id) {
      ctx.status = 400;
      ctx.body = { error: 'property_url o property_id es requerido' };
      return;
    }

    // Buscar propiedad por id o url
    const property = property_id
      ? await ctx.orm.Propertie.findByPk(property_id)
      : await ctx.orm.Propertie.findOne({ where: { url: property_url } });

    if (!property) {
      ctx.status = 404;
      ctx.body = { error: 'Propiedad no encontrada' };
      return;
    }

    const email = ctx.state.user?.email || ctx.state.user?.mail;
    if (!email) {
      ctx.status = 400;
      ctx.body = { error: 'Usuario sin email en el token' };
      return;
    }

    const priceNum = Number(property.price || 0);
    if (!Number.isFinite(priceNum) || priceNum <= 0) {
      ctx.status = 422;
      ctx.body = { error: 'Precio inválido en la propiedad' };
      return;
    }

    const price10 = Number((priceNum * 0.10).toFixed(2));

    // Evitar duplicados: buscar intención PENDING existente
    const existingIntent = await ctx.orm.PurchaseIntent.findOne({
      where: {
        propertieId: property.id,
        email,
        status: 'PENDING',
      },
      order: [['createdAt', 'DESC']],
    });

    let request_id;
    if (existingIntent) {
      request_id = existingIntent.request_id;
      console.log(`Reutilizando PurchaseIntent existente request_id=${request_id} para property_id=${property.id}`);
    } else {
      request_id = randomUUID();
      await ctx.orm.PurchaseIntent.create({
        request_id,
        group_id: process.env.GROUP_ID || '11',
        url: property.url,
        origin: 0,
        operation: 'BUY',
        status: 'PENDING',
        price_amount: price10.toFixed(2),
        price_currency: property.currency || 'CLP',
        email,
        propertieId: property.id,
      });
    }
    ctx.status = 201;
    ctx.body = {
      message: existingIntent ? 'Intención existente reutilizada' : 'Intención creada',
      request_id,
      property_url: property.url,
      property_name: property.name,
      available_offers: property.offers,
      status: 'pending',
    };
  } catch (err) {
    console.error('create-intent error:', err);
    ctx.status = 500;
    ctx.body = { error: 'Error interno' };
  }
});

router.post('/commit', authenticate, async (ctx) => {
  try {
    const { token_ws, property_id } = ctx.request.body;

    // Buscar el purchaseintent asociado a esta propiedad
    const intent = await ctx.orm.PurchaseIntent.findOne({
      where: { propertieId: property_id },
      order: [["createdAt", "DESC"]],
    });

    const request_id = intent?.request_id;
    if (!request_id) {
      ctx.status = 400;
      ctx.body = { error: "No se encontró PurchaseIntent para esta propiedad" };
      return;
    }

    if (!token_ws || !property_id) {
      ctx.status = 400;
      ctx.body = { error: 'token_ws y property_id son requeridos' };
      return;
    }

    let confirmedTx;
    try {
      confirmedTx = await tx.commit(String(token_ws));
    } catch (err) {
      console.error('Error confirmando transacción en Transbank:', err);
      ctx.status = 502;
      ctx.body = { error: 'Error confirmando transacción' };
      return;
    }

    // Si Transbank rechazó la compra
    if (!confirmedTx || Number(confirmedTx.response_code) !== 0) {
      ctx.status = 400;
      ctx.body = { message: 'Transacción no aprobada', details: confirmedTx };
      sendValidationResult('REJECTED', request_id);
      return;
    }

    // Si está aprobada, replicamos la lógica de create.purchase: crear intención y publicar request
    const property = await ctx.orm.Propertie.findByPk(property_id);
    if (!property) {
      ctx.status = 404;
      ctx.body = { error: 'Propiedad no encontrada' };
      return;
    }

    if (property.offers <= 0) {
      ctx.status = 400;
      ctx.body = { error: 'No hay ofertas disponibles' };
      sendValidationResult('OK', request_id);
      return;
    }

    try {
      await ctx.orm.EventLog.create({
        topic: "properties/requests",
        event_type: "REQUEST",
        timestamp: new Date().toISOString(),
        url: property.url,
        request_id,
        group_id: process.env.GROUP_ID || "unknown",
        origin: 0,
        operation: "BUY",
        status: "PENDING",
        raw: JSON.stringify({
          property_id: property.id,
          property_name: property.name,
          property_url: property.url,
          price: property.price,
          currency: property.currency,
        }),
      });
      console.log(`🔵 EventLog REQUEST creado para ${request_id}`);
    } catch (err) {
      console.error("Error creando EventLog REQUEST:", err.message);
    }

    sendValidationResult('ACCEPTED', request_id);
    try {
      if (!LAMBDA_URL) {
        console.error("❌ LAMBDA_URL no está definido en el .env");
      } else {
        const lambdaBody = {
          groupName: "Grupo 11",
          user: {
            name: ctx.state.user?.name || "Usuario",
            email: ctx.state.user?.email || ctx.state.user?.mail || "sin-email@uc.cl",
          },
          purchase: {
            id: intent.id,
            propertyName: property.name,
            propertyUrl: property.url,
            amount: intent.price_amount,
            currency: intent.price_currency,
            status: "ACCEPTED",
            date: new Date().toISOString(),
          },
        };

        console.log("🟢 Enviando payload a Lambda:", lambdaBody);

        const res = await axios.post(LAMBDA_URL, lambdaBody, { timeout: 15000 });
        const receiptUrl = res.data?.url;

        if (receiptUrl) {
          intent.receipt_url = receiptUrl;
          await intent.save();
          console.log(`Boleta generada correctamente: ${receiptUrl}`);
        } else {
          console.warn("Lambda respondió sin URL de boleta:", res.data);
        }
      }
    } catch (err) {
      console.error("❌ Error generando boleta con Lambda:");
      if (err.response) {
        console.error("Código:", err.response.status);
        console.error("Respuesta Lambda:", err.response.data);
      } else {
        console.error(err.message);
      }
    }

    ctx.status = 201;
    ctx.body = {
      message: 'Compra confirmada y validación enviada',
      request_id,
      property_url: property.url,
      property_name: property.name,
      available_offers: property.offers,
      status: 'aceptada',
      boleta_url: intent.receipt_url || null,
    };
    return;
  } catch (error) {
    console.error('Error en /commit:', error);
    ctx.status = 500;
    ctx.body = { error: 'Error interno del servidor' };
  }
});

// [INTERNO] para reducir offers (llamado desde MQTT)
router.post("reduce.offers", "/reduce-offers", async (ctx) => {
  try {
    const { property_url, operation } = ctx.request.body;

    if (!property_url) {
      ctx.status = 400;
      ctx.body = { error: "property_url es requerido" };
      return;
    }

    const cleanUrl = property_url.split("#")[0].split("?")[0].trim();
    console.log(`[REDUCE] URL original: ${property_url}`);
    console.log(`[REDUCE] URL limpia: ${cleanUrl}`);

    // Buscar por coincidencia exacta de URL limpia
    let property = await ctx.orm.Propertie.findOne({ where: { url: cleanUrl } });

    // Si no se encuentra, probar coincidencia parcial (fallback)
    if (!property) {
      property = await ctx.orm.Propertie.findOne({
        where: ctx.orm.Sequelize.where(
          ctx.orm.Sequelize.fn("replace", ctx.orm.Sequelize.col("url"), "#", ""),
          { [ctx.orm.Sequelize.Op.like]: `%${cleanUrl}%` }
        ),
      });
    }

    if (!property) {
      console.warn(`[REDUCE] Propiedad no encontrada para URL: ${cleanUrl}`);
      ctx.status = 404;
      ctx.body = { error: "Propiedad no encontrada" };
      return;
    }

    // 🔹 Reducir oferta (aunque operation no se envíe)
    if ((operation === "REDUCE" || !operation) && Number(property.offers || 0) > 0) {
      console.log(`[REDUCE] Ofertas antes: ${property.offers} (${property.name})`);
      property.offers = Number(property.offers) - 1;
      await property.save();
      console.log(`[REDUCE] Guardado. Ofertas ahora: ${property.offers}`);

      ctx.status = 200;
      ctx.body = {
        message: "Offer reducida",
        remaining_offers: property.offers,
      };
      return;
    }

    ctx.status = 200;
    ctx.body = {
      message: "No se redujo (condición no cumplida)",
      offers: property.offers,
    };
  } catch (error) {
    console.error("Error gestionando offers:", error);
    ctx.status = 500;
    ctx.body = { error: "Error interno del servidor" };
  }
});

// Endpoint para listar compras del usuario autenticado (RF04)
router.get("/", authenticate, async (ctx) => {
  const email = ctx.state.user?.email || ctx.state.user?.mail;

  const purchases = await ctx.orm.PurchaseIntent.findAll({
    where: { email },
    order: [['createdAt', 'DESC']],
    include: [{
      model: ctx.orm.Propertie,
      as: 'propertie', // debe coincidir con el nombre del modelo
      attributes: ['id', 'name', 'url', 'location', 'price', 'currency', 'img'],
    }],
  });

  ctx.body = purchases;
});

// Endpoint para obtener detalle de una compra por ID (RF04) (no se si es necesario)
router.get("/:id", authenticate, async (ctx) => {
  const email = ctx.state.user?.email || ctx.state.user?.mail;
  const p = await ctx.orm.PurchaseIntent.findOne({
    where: { id: ctx.params.id, email }
  });
  if (!p) { ctx.status = 404; ctx.body = { error: 'No encontrada' }; return; }
  ctx.body = p;
});

// Endpoints idempotentes para manejar reservas y validaciones repetidas

// [INTERNO] Idempotente: reserva (descuenta 1) a partir de un REQUEST
router.post("reserve.from.request", "/reserve-from-request", async (ctx) => {
  try {
    const { request_id, url } = ctx.request.body;

    if (!request_id || !url) {
      ctx.status = 400;
      ctx.body = { error: "request_id y url son requeridos" };
      return;
    }

    if (!isUuid(request_id)) {
      ctx.status = 400;
      ctx.body = { error: "request_id debe ser un UUID válido" };
      return;
    }

    // verificamos si ya reservamos antes
    const alreadyReserved = await ctx.orm.EventLog.findOne({
      where: { request_id, event_type: "RESERVED" },
    });
    if (alreadyReserved) {
      ctx.status = 200;
      ctx.body = { message: "Ya reservado", request_id };
      return;
    }

    const property = await ctx.orm.Propertie.findOne({ where: { url } });
    if (!property) {
      ctx.status = 404;
      ctx.body = { error: "Propiedad no encontrada para esa url" };
      return;
    }

    // Solo si hay stock
    if (property.offers > 0) {
      property.offers -= 1;
      await property.save();
    }

    // Dejamos constancia para idempotencia futura
    await ctx.orm.EventLog.create({
      topic: "properties/requests",
      event_type: "RESERVED",
      timestamp: new Date().toISOString(),
      url,
      request_id,
      raw: { reason: "local reservation while validating" },
    });

    ctx.status = 200;
    ctx.body = {
      message: "Reserva aplicada",
      request_id,
      url,
      remaining_offers: property.offers,
    };
  } catch (err) {
    console.error("reserve-from-request error:", err);
    ctx.status = 500;
    ctx.body = { error: "Error interno" };
  }
});

// [INTERNO] Idempotente: asentar VALIDATION y (si corresponde) devolver la visita
router.post("settle.from.validation", "/settle-from-validation", async (ctx) => {
  try {
    const { request_id, status } = ctx.request.body;

    if (!request_id) {
      ctx.status = 400;
      ctx.body = { error: "request_id es requerido" };
      return;
    }

    if (!isUuid(request_id)) {
      ctx.status = 400;
      ctx.body = { error: "request_id debe ser un UUID válido" };
      return;
    }

    // Trae el REQUEST original para obtener la URL
    const requestEvent = await ctx.orm.EventLog.findOne({
      where: { request_id, event_type: "REQUEST" },
      order: [["id", "DESC"]],
    });

    if (!requestEvent || !requestEvent.url) {
      ctx.status = 404;
      ctx.body = { error: "REQUEST no encontrado o sin URL" };
      return;
    }

    const property = await ctx.orm.Propertie.findOne({ where: { url: requestEvent.url } });
    if (!property) {
      ctx.status = 404;
      ctx.body = { error: "Propiedad no encontrada para la URL del REQUEST" };
      return;
    }

    const s = String(status || "").toUpperCase();

    // Idempotencia: ya asentado
    const alreadySettled = await ctx.orm.EventLog.findOne({
      where: { request_id, event_type: "SETTLED" },
    });
    if (alreadySettled) {
      ctx.status = 200;
      ctx.body = { message: "Ya asentado", status: s };
      return;
    }

    // Si fue rechazado/error => devolvemos la visita (solo si reservamos antes)
    if (s === "REJECTED" || s === "ERROR") {
      const hadReserved = await ctx.orm.EventLog.findOne({
        where: { request_id, event_type: "RESERVED" },
      });
      if (hadReserved) {
        property.offers += 1;
        await property.save();

        await ctx.orm.EventLog.create({
          topic: "properties/validation",
          event_type: "RELEASED",
          timestamp: new Date().toISOString(),
          url: requestEvent.url,
          request_id,
          status: s,
          raw: { reason: "release by rejected/error" },
        });
      }
    }

    // Siempre registramos SETTLED una sola vez
    await ctx.orm.EventLog.create({
      topic: "properties/validation",
      event_type: "SETTLED",
      timestamp: new Date().toISOString(),
      url: requestEvent.url,
      request_id,
      status: s,
      raw: {},
    });

    // RF01 E2: si la validación fue exitosa, encolamos recomendaciones (idempotente)
    if (s === 'ACCEPTED' || s === 'OK') {
      // evitar duplicados: revisa si ya encolamos para este request
      const alreadyQueued = await ctx.orm.EventLog.findOne({
        where: { request_id, event_type: 'RECO_JOB_ENQUEUED' },
      });
      if (!alreadyQueued) {
        // obtener base de datos de la intención para user y propiedad
        const intent = await ctx.orm.PurchaseIntent.findOne({ where: { request_id } });
        if (intent) {
          try {
            const job = await enqueueRecommendationJob({
              userId: intent.email,
              propertyId: String(intent.propertieId),
              source: 'purchase',
            });
            await ctx.orm.EventLog.create({
              topic: 'jobs/recommendations',
              event_type: 'RECO_JOB_ENQUEUED',
              timestamp: new Date().toISOString(),
              url: requestEvent.url,
              request_id,
              status: s,
              raw: { jobId: job?.jobId },
            });
          } catch (e) {
            console.error('Error encolando recomendaciones:', e?.message || e);
            // No bloqueamos el asentamiento; solo registramos el fallo
            await ctx.orm.EventLog.create({
              topic: 'jobs/recommendations',
              event_type: 'RECO_JOB_FAILED',
              timestamp: new Date().toISOString(),
              url: requestEvent.url,
              request_id,
              status: s,
              raw: { error: e?.message || String(e) },
            });
          }
        }
      }
    }

    ctx.status = 200;
    ctx.body = {
      message: "Validación asentada",
      request_id,
      status: s,
      url: requestEvent.url,
      offers: property.offers,
    };
  } catch (err) {
    console.error("settle-from-validation error:", err);
    ctx.status = 500;
    ctx.body = { error: "Error interno" };
  }
});

// actualizar estado de purchaseintents
router.patch("/purchase-intents/:request_id/status", async (ctx) => {
  try {
    const { request_id } = ctx.params;
    const { status } = ctx.request.body;

    if (!request_id || !status) {
      ctx.status = 400;
      ctx.body = { error: "request_id y status son requeridos" };
      return;
    }

    const intent = await ctx.orm.PurchaseIntent.findOne({ where: { request_id } });
    if (!intent) {
      ctx.status = 404;
      ctx.body = { error: "PurchaseIntent no encontrado" };
      return;
    }

    intent.status = status;
    await intent.save();

    ctx.status = 200;
    ctx.body = { message: "Estado actualizado", request_id, status };
    console.log(`🟢 PurchaseIntent ${request_id} → ${status}`);
  } catch (err) {
    console.error("Error actualizando estado:", err.message);
    ctx.status = 500;
    ctx.body = { error: "Error interno del servidor" };
  }
});


module.exports = router;
