const Router = require('@koa/router');
const { v4: uuidv4 } = require('uuid');
const authenticate = require('../middlewares/authenticate');

const router = new Router();

//POST /purchases { propertieId }
//verifica stock (offers) y saldo (10% del precio)
//descuenta saldo y reserva cupo (offers--)
//crea PurchaseIntent en estado PENDING
router.post('/', authenticate, async (ctx) => {
  const email = ctx.state.user?.email || ctx.state.user?.mail;
  const { propertieId, group_id } = ctx.request.body || {};

  if (!propertieId) {
    ctx.status = 400;
    ctx.body = { error: 'propertieId requerido' };
    return;
  }

  const prop = await ctx.orm.Propertie.findByPk(propertieId);
  if (!prop) {
    ctx.status = 404;
    ctx.body = { error: 'Propiedad no encontrada' };
    return;
  }

  const priceNum = Number(prop.price);
  if (!Number.isFinite(priceNum) || priceNum <= 0) {
    ctx.status = 422;
    ctx.body = { error: 'Precio inválido en la propiedad' };
    return;
  }

  const price10 = priceNum * 0.10;
  const currency = prop.currency || 'CLP';

  //stock disponible (offers)
  const offersNum = Number(prop.offers || 0);
  if (!Number.isFinite(offersNum) || offersNum <= 0) {
    ctx.status = 409;
    ctx.body = { error: 'No hay visitas disponibles' };
    return;
  }

  //wallet por email
  const [wallet] = await ctx.orm.Wallet.findOrCreate({
    where: { email },
    defaults: { balance: 0 },
  });

  const balanceNum = Number(wallet.balance || 0);
  if (balanceNum < price10) {
    ctx.status = 402; //payment required
    ctx.body = { error: 'Saldo insuficiente', required: price10, balance: balanceNum };
    return;
  }

  //descuento saldo y reservo cupo
  wallet.balance = balanceNum - price10;
  await wallet.save();

  prop.offers = offersNum - 1;
  await prop.save();

  // intencion de registro (queda PENDING; RF05 actualizará estado vía broker)
  const request_id = uuidv4();
  const intent = await ctx.orm.PurchaseIntent.create({
    request_id,
    group_id: group_id || process.env.GROUP_ID || '11',
    url: prop.url,
    origin: 0,
    operation: 'BUY',
    status: 'PENDING',
    price_amount: price10.toFixed(2),
    price_currency: currency,
    email,
    propertieId: prop.id, 
  });

  ctx.status = 201;
  ctx.body = { message: 'Intento de compra creado y visita reservada', intent };
});

module.exports = router;
