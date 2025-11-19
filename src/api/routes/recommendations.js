const Router = require('@koa/router');

const router = new Router();

// GET /recommendations?userId=11
router.get('/', async (ctx) => {
  const { userId } = ctx.query;
  if (!userId) {
    ctx.status = 400;
    ctx.body = { error: 'userId query param required' };
    return;
  }

  try {
    const recs = await ctx.orm.Recommendation.findAll({
      where: { userId: String(userId) },
      order: [['createdAt', 'DESC']],
    });
    ctx.body = recs;
  } catch (err) {
    console.error('GET /recommendations error:', err);
    ctx.status = 500;
    ctx.body = { error: 'Internal error' };
  }
});

module.exports = router;