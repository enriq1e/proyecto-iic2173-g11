const Router = require("@koa/router");
const { sendPurchaseRequest } = require("../../broker/mqttClient");

//agregados minimos para RF03
const { v4: uuidv4 } = require('uuid');
const authenticate = require('../middlewares/authenticate');

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

    //BLOQUE RF03: Wallet + PurchaseIntent (minimo invasivo)
    const email = ctx.state.user?.email || ctx.state.user?.mail;
    const priceNum = Number(property.price);
    if (!Number.isFinite(priceNum) || priceNum <= 0) {
      ctx.status = 422;
      ctx.body = { error: 'Precio inválido en la propiedad' };
      return;
    }
    const price10 = priceNum * 0.10;
    const currency = property.currency || 'CLP';

    //Wallet: validar y descontar (bloqueo de fondos)
    const [wallet] = await ctx.orm.Wallet.findOrCreate({
      where: { email },
      defaults: { balance: 0 },
    });
    const balanceNum = Number(wallet.balance || 0);
    if (balanceNum < price10) {
      ctx.status = 402; //Payment Required
      ctx.body = { error: 'Saldo insuficiente', required: price10, balance: balanceNum };
      return;
    }
    wallet.balance = balanceNum - price10;
    await wallet.save();

    //Crear intencion PENDING (sin tocar offers aquí)
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
    //FIN BLOQUE RF03

    // 2. Publicar solicitud al broker (RF05)
    console.log(`Enviando solicitud de compra para: ${property.name} (${property.offers} offers disponibles)`);
    sendPurchaseRequest(property_url, request_id);
    //(Ideal futuro: enviar tambien request_id/email en el payload MQTT.)

    ctx.body = {
      message: "Solicitud de compra enviada",
      property_url: property_url,
      property_name: property.name,
      available_offers: property.offers,
      status: "pending",
      request_id
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
    // si quieres incluir datos de la propiedad:
    // include: [{ model: ctx.orm.Propertie, attributes: ['id','name','url','location'] }]
  });

  ctx.body = purchases;
});

//Endpoint para obtener detalle de una compra por ID (RF04) (no se si es necesario)
router.get("/:id", authenticate, async (ctx) => {
  const email = ctx.state.user?.email || ctx.state.user?.mail;
  const p = await ctx.orm.PurchaseIntent.findOne({
    where: { id: ctx.params.id, email }
  });
  if (!p) { ctx.status = 404; ctx.body = { error: 'No encontrada' }; return; }
  ctx.body = p;
});


module.exports = router;
