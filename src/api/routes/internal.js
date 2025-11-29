const Router = require('@koa/router');

const router = new Router();

// Guardia simple por API key: si existe INTERNAL_API_KEY se exige header X-Internal-Key igual
function checkInternalKey(ctx) {
  const expected = process.env.INTERNAL_API_KEY;
  if (!expected) return true;
  const got = ctx.request.headers['x-internal-key'];
  return String(got || '') === String(expected);
}

router.post('/recommendations', async (ctx) => {
  try {
    console.log('➡️ /recommendations llamada');

    if (!checkInternalKey(ctx)) {
      console.warn('❌ Unauthorized request');
      ctx.status = 401;
      ctx.body = { error: 'Unauthorized' };
      return;
    }

    const { userId, propertyId, recommendations } = ctx.request.body || {};
    if (!userId || !propertyId) {
      console.warn('❌ userId or propertyId missing', ctx.request.body);
      ctx.status = 400;
      ctx.body = { error: 'userId and propertyId are required' };
      return;
    }

    const basePropertyId = Number(propertyId);
    if (!Number.isFinite(basePropertyId)) {
      console.warn('❌ propertyId not a valid integer', propertyId);
      ctx.status = 400;
      ctx.body = { error: 'propertyId must be a valid integer' };
      return;
    }

    const finalUserId = String(userId);

    const ids = Array.isArray(recommendations)
      ? recommendations.map((r) => (typeof r === 'object' ? r.id : r)).filter(Boolean)
      : (Array.isArray(ctx.request.body?.recommendationIds) ? ctx.request.body.recommendationIds : []);

    console.log(`👤 Procesando recomendaciones para userId=${finalUserId}, basePropertyId=${basePropertyId}`);
    console.log('🔹 Nuevos IDs:', ids);

    // Borrar recomendaciones antiguas de este userId y basePropertyId
    const deletedCount = await ctx.orm.Recommendation.destroy({
      where: { userId: finalUserId },
    });
    console.log(`🗑 Recomendaciones antiguas borradas: ${deletedCount}`);

    // Guardar nuevas recomendaciones
    const created = await ctx.orm.Recommendation.create({
      userId: finalUserId,
      basePropertyId,
      recommendationIds: ids,
    });
    console.log('✅ Nuevas recomendaciones creadas:', created.toJSON());

    ctx.status = 200;
    ctx.body = { ok: true, count: ids.length };
  } catch (err) {
    console.error('❌ internal /recommendations error:', err);
    ctx.status = 500;
    ctx.body = { error: 'Internal error' };
  }
});



module.exports = router;
