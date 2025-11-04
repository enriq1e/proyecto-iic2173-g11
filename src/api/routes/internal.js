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
    // Convertimos propertyId a entero (la columna basePropertyId es INTEGER)
    const basePropertyId = Number(propertyId);
    if (!Number.isFinite(basePropertyId)) {
      ctx.status = 400;
      ctx.body = { error: 'propertyId must be a valid integer' };
      return;
    }
    
    // Si userId es un email, buscar el usuario y obtener su ID numérico
    let finalUserId = userId;
    if (typeof userId === 'string' && userId.includes('@')) {
      const user = await ctx.orm.User.findOne({ where: { email: userId } });
      if (!user) {
        ctx.status = 404;
        ctx.body = { error: `User not found for email: ${userId}` };
        return;
      }
      finalUserId = user.id;
      console.log(`[internal/recs] Mapped email ${userId} to user ID ${finalUserId}`);
    }
    
    const ids = Array.isArray(recommendations)
      ? recommendations.map((r) => (typeof r === 'object' ? r.id : r)).filter(Boolean)
      : [];

    // Upsert por (userId, basePropertyId)
    const [rec, created] = await ctx.orm.Recommendation.findOrCreate({
      where: { userId: finalUserId, basePropertyId },
      defaults: { userId: finalUserId, basePropertyId, recommendationIds: ids },
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
