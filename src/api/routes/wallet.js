const Router = require('@koa/router');
const authenticate = require('../middlewares/authenticate');

const router = new Router();

// GET /wallet: muestra saldo actual y crea si no existe
router.get('/', authenticate, async (ctx) => {
  const email = ctx.state.user?.email || ctx.state.user?.mail;
  const [wallet] = await ctx.orm.Wallet.findOrCreate({
    where: { email }, defaults: { balance: 0 }
  });
  ctx.body = { email, balance: wallet.balance };
});

// POST /wallet/recharge: uma saldo
router.post('/recharge', authenticate, async (ctx) => {
  const email = ctx.state.user?.email || ctx.state.user?.mail;
  const amount = Number(ctx.request.body?.amount || 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    ctx.status = 400; ctx.body = { error: 'Monto inválido' }; return;
  }
  const [wallet] = await ctx.orm.Wallet.findOrCreate({
    where: { email }, defaults: { balance: 0 }
  });
  wallet.balance = Number(wallet.balance) + amount;
  await wallet.save();
  ctx.body = { email, balance: wallet.balance };
});

module.exports = router;
