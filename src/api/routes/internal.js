const Router = require('@koa/router');

const router = new Router();

// Guardia simple por API key: si existe INTERNAL_API_KEY se exige header X-Internal-Key igual
function checkInternalKey(ctx) {
  const expected = process.env.INTERNAL_API_KEY;
  if (!expected) return true;
  const got = ctx.request.headers['x-internal-key'];
  return String(got || '') === String(expected);
}

// Persiste recomendaciones enviadas por el worker (webhook)
router.post('/recommendations', async (ctx) => {
  try {
    if (!checkInternalKey(ctx)) {
      ctx.status = 401;
      ctx.body = { error: 'Unauthorized' };
      return;
    }

    const { userId, propertyId, recommendations, jobId } = ctx.request.body || {};
    if (!userId || !propertyId) {
      ctx.status = 400;
      ctx.body = { error: 'userId and propertyId are required' };
      return;
    }
    const ids = Array.isArray(recommendations)
      ? recommendations.map((r) => (typeof r === 'object' ? r.id : r)).filter(Boolean)
      : [];

    // Upsert por (userId, basePropertyId)
    const [rec, created] = await ctx.orm.Recommendation.findOrCreate({
      where: { userId, basePropertyId: propertyId },
      defaults: { userId, basePropertyId: propertyId, recommendationIds: ids },
    });
    if (!created) {
      rec.recommendationIds = ids;
      await rec.save();
    }

    ctx.status = 200;
    ctx.body = { ok: true, count: ids.length };
  } catch (err) {
    console.error('internal /recommendations error:', err);
    ctx.status = 500;
    ctx.body = { error: 'Internal error' };
  }
});

module.exports = router;
