const Router = require('@koa/router');

const router = new Router();

// GET /recommendations?userId=<email>
// Retorna las recomendaciones más recientes para un usuario
router.get('/', async (ctx) => {
  try {
    const { userId, user_id } = ctx.query;
    const userIdentifier = userId || user_id;

    if (!userIdentifier) {
      ctx.status = 400;
      ctx.body = { error: 'userId o user_id es requerido' };
      return;
    }

    // Buscar la recomendación más reciente para este usuario
    const recommendation = await ctx.orm.Recommendation.findOne({
      where: { userId: String(userIdentifier) },
      order: [['createdAt', 'DESC']],
    });

    if (!recommendation || !Array.isArray(recommendation.recommendationIds)) {
      ctx.status = 200;
      ctx.body = [];
      return;
    }

    // Obtener las propiedades recomendadas
    const properties = await ctx.orm.Propertie.findAll({
      where: { id: recommendation.recommendationIds },
    });

    ctx.status = 200;
    ctx.body = properties;
  } catch (error) {
    console.error('Error obteniendo recomendaciones:', error);
    ctx.status = 500;
    ctx.body = { error: 'Error interno del servidor' };
  }
});

module.exports = router;