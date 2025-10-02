const Router = require("@koa/router");
const { sendPurchaseRequest } = require("../../broker/mqttClient");

// agregados minimos para RF03
const { v4: uuidv4 } = require('uuid');
const authenticate = require('../middlewares/authenticate');

// Para idempotencia (validar UUIDs)
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isUuid = (value) => UUID_REGEX.test(String(value || ""));

const router = new Router();

// Endpoint para crear una solicitud de compra (ahora autenticado)
router.post("create.purchase", "/", authenticate, async (ctx) => {
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

    // BLOQUE RF03: Wallet + PurchaseIntent (minimo invasivo)
    const email = ctx.state.user?.email || ctx.state.user?.mail;
    const priceNum = Number(property.price);
    if (!Number.isFinite(priceNum) || priceNum <= 0) {
      ctx.status = 422;
      ctx.body = { error: 'Precio inválido en la propiedad' };
      return;
    }
    const price10 = priceNum * 0.10;
    const currency = property.currency || 'CLP';

    // Wallet: validar y descontar (bloqueo de fondos)
    const [wallet] = await ctx.orm.Wallet.findOrCreate({
      where: { email },
      defaults: { balance: 0 },
    });
    const balanceNum = Number(wallet.balance || 0);
    if (balanceNum < price10) {
      ctx.status = 402; // Payment Required
      ctx.body = { error: 'Saldo insuficiente', required: price10, balance: balanceNum };
      return;
    }
    wallet.balance = balanceNum - price10;
    await wallet.save();

    // Crear intención PENDING (sin tocar offers aquí)
    const request_id = uuidv4();
    await ctx.orm.PurchaseIntent.create({
      request_id,
      group_id: process.env.GROUP_ID || '11',
      url: property.url,
      origin: 0,
      operation: 'BUY',
      status: 'PENDING',
      price_amount: price10.toFixed(2),
      price_currency: currency,
      email,
      propertieId: property.id,
    });
    // FIN BLOQUE RF03

    // 2. Publicar solicitud al broker (RF05)
    console.log(`Enviando solicitud de compra para: ${property.name} (${property.offers} offers disponibles) [request_id=${request_id}]`);
    // Intento 1 RNF10 (+ posibilidad de retry de usuario fuera de este flujo)
    try {
      await sendPurchaseRequest(property_url, request_id);
    } catch (e1) {
      console.warn("Compra: intento 1 falló, reintentando 1 vez…", e1.message || e1);
      try {
        await sendPurchaseRequest(property_url, request_id);
      } catch (e2) {
        ctx.status = 502;
        ctx.body = {
          error: "Solicitud de compra fallida tras 1 reintento",
          request_id,
          details: e2.message || String(e2),
        };
        return;
      }
    }

    ctx.body = {
      message: "Solicitud de compra enviada",
      request_id,
      property_url: property_url,
      property_name: property.name,
      available_offers: property.offers,
      status: "pending",
    };
    ctx.status = 201;

  } catch (error) {
    console.error("Error en solicitud de compra:", error);
    ctx.body = { error: "Error interno del servidor" };
    ctx.status = 500;
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
