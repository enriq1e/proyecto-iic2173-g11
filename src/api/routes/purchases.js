const Router = require("@koa/router");
const { client: mqttClient } = require("../../broker/mqttClient");

// agregados minimos para RF03
const { randomUUID } = require('crypto');
const authenticate = require('../middlewares/authenticate');
const { tx } = require('../utils/transactions.js');
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
    const priceNum = Number(property.price);

    const trx = await tx.create(String(property.id), "g11-business", priceNum, process.env?.REDIRECT_URL || `http://localhost:5173/completed-purchase?property_id=${property.id}`);

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
    if (!token_ws || !property_id) {
      ctx.status = 400;
      ctx.body = { error: 'token_ws y property_id son requeridos' };
      return;
    }

    // Confirmar la transacción con Transbank
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
      return;
    }

    // Si está aprobada, replicamos la lógica de create.purchase: crear intención y publicar request
    const property = await ctx.orm.Propertie.findByPk(property_id);
    if (!property) {
      ctx.status = 404;
      ctx.body = { error: 'Propiedad no encontrada' };
      return;
    }

    const request_id = randomUUID();

    const purchaseRequest = {
      request_id,
      group_id: process.env.GROUP_ID || '11',
      timestamp: new Date().toISOString(),
      url: property.url,
      origin: 0,
      operation: 'BUY',
    };

    // Publicar en el topic compartido
    try {
      await new Promise((resolve, reject) => {
        mqttClient.publish(process.env.TOPIC_REQUEST, JSON.stringify(purchaseRequest), (err) => {
          if (err) return reject(err);
          console.log('Solicitud publicada desde /commit:', request_id);
          resolve();
        });
      });
    } catch (err) {
      console.error('Error publicando solicitud desde /commit:', err?.message || err);
      // No abortamos la respuesta; informamos que hubo un problema publicando
      ctx.body = {
        message: "Compra confirmada, pero fallo al publicar la solicitud",
        request_id,
        property_url: property.url,
        details: err?.message || String(err),
      };
      ctx.status = 201;
      return;
    }

    ctx.status = 201;
    ctx.body = {
      message: 'Compra confirmada y solicitud enviada',
      request_id,
      property_url: property.url,
      property_name: property.name,
      available_offers: property.offers,
      status: 'pending'
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
      ctx.body = { error: "property_url es requerido" };
      ctx.status = 400;
      return;
    }

    const property = await ctx.orm.Propertie.findOne({ where: { url: property_url } });
    if (!property) {
      ctx.body = { error: "Propiedad no encontrada" };
      ctx.status = 404;
      return;
    }

    if (operation === "REDUCE" && Number(property.offers || 0) > 0) {
      property.offers = Number(property.offers) - 1;
      await property.save();

      console.log(`Offers reducidas a ${property.offers} para: ${property.name}`);
      ctx.body = {
        message: "Offer reducida",
        remaining_offers: property.offers
      };
    }

    ctx.status = 200;

  } catch (error) {
    console.error("Error gestionando offers:", error);
    ctx.body = { error: "Error interno del servidor" };
    ctx.status = 500;
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

module.exports = router;
