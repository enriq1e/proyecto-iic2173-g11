const Router = require('@koa/router');

const router = new Router();

// GET /recommendations?userId=<email>
router.get('/', async (ctx) => {
  try {
    const { userId } = ctx.query;

    if (!userId) {
      ctx.status = 400;
      ctx.body = { error: 'userId es requerido' };
      return;
    }

    // Buscar todas las recomendaciones de este usuario
    const recommendations = await ctx.orm.Recommendation.findAll({
      where: { userId: String(userId) },
      order: [['createdAt', 'DESC']],
    });

    if (!recommendations.length) {
      ctx.status = 200;
      ctx.body = [];
      return;
    }

    //Combinar todos los recommendationIds en un array único
    const allIds = [...new Set(recommendations.flatMap(r => r.recommendationIds || []))];

    //Obtener propiedades recomendadas
    const properties = await ctx.orm.Propertie.findAll({
      where: { id: allIds },
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
