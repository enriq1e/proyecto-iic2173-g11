const Router = require("@koa/router");
const { Op, fn, col, where, Sequelize  } = require("sequelize");
const { getUfValue } = require("../utils/uf");

const router = new Router();

router.post("post.propertie", "/", async (ctx) => {
  try {
    const data = ctx.request.body;

    // vemos si creamos la propiedad o si ya existe para actualizar "offers"
    const [propertie, created] = await ctx.orm.Propertie.findOrCreate({
      where: { url: data.url, name: data.name },
      defaults: { ...data, offers: 1 }
    });

    // si existe actualizamos "offers" y el "timestapm"
    if (!created) {
        propertie.offers += 1;
        propertie.timestamp = new Date(data.timestamp);
        await propertie.save();
    }

    ctx.body = propertie;
    if (created) {
        ctx.status = 201;
        return;
    }
    ctx.status = 200;

  } catch (error) {
    ctx.body = error;
    ctx.status = 400;
  }
});

router.get("index", "/", async (ctx) => {
    try {
        // filtros
        const filters = {};

        // paginacion y limite de 25
        const page = parseInt(ctx.query.page) || 1;
        const limit = parseInt(ctx.query.limit) || 25; // para que se pueda cambiar
        const offset = (page - 1) * limit;

        // filtros por precio, lugar y fecha
        if (ctx.query.price) {
            const maxPrice = parseFloat(ctx.query.price);
            const UF_value = 40000; //para que tambien filtre las propiedades con UF

            filters[Op.or] = [
                {
                currency: "$",
                price: { [Op.lt]: maxPrice },
                },
                Sequelize.where(
                Sequelize.literal(`"Propertie"."currency" = 'UF' AND CAST("Propertie"."price" AS FLOAT) * ${UF_value}`),
                { [Op.lt]: maxPrice }
                ),
            ];
        }
        if (ctx.query.location) {
            filters.location = { [Op.iLike]: `%${ctx.query.location}%` };
        }
        if (ctx.query.date) {
            filters[Op.and] = where(
                fn("DATE", col("timestamp")), // con esto elimino la hora pra que solo compare la fecha
                ctx.query.date
            );
        }

                // Si hay userId y existen recomendaciones, las anteponemos
                const userId = ctx.query.userId || ctx.query.user_id || null;
                let recommendedFirst = [];
                let excludeIds = [];

                if (userId) {
                    const rec = await ctx.orm.Recommendation.findOne({
                        where: { userId },
                        order: [["createdAt", "DESC"]],
                    });
                    if (rec && Array.isArray(rec.recommendationIds) && rec.recommendationIds.length) {
                        const recProps = await ctx.orm.Propertie.findAll({
                            where: { id: rec.recommendationIds },
                        });
                        recommendedFirst = recProps.map(p => ({ ...p.toJSON(), recommended: true }));
                        excludeIds = rec.recommendationIds;
                    }
                }

                // aplicamos los filtros y buscamos el resto (excluyendo recomendadas)
                const whereRest = { ...filters };
                if (excludeIds.length) {
                    whereRest.id = { [Op.notIn]: excludeIds };
                }

                const rest = await ctx.orm.Propertie.findAll({ 
                        where: whereRest,
                        limit: Math.max(0, limit - recommendedFirst.length),
                        offset,
                        order:[["timestamp", "DESC"]]
                });

                ctx.body = [...recommendedFirst, ...rest];
        ctx.status = 200;

    } catch (error) {
        ctx.body = error;
        ctx.status = 400;
    }
});

router.get("show.one.propertie", "/:id", async (ctx) => {
    try {
        const propertie = await ctx.orm.Propertie.findByPk(ctx.params.id);
        if (!propertie) {
            ctx.body = "Not Found";
            ctx.status = 404;
            return;
        }

        // RNF11: calcular 10% en CLP
        let tenPercentClp = null;
        if (propertie.currency === 'UF') {
          const uf = await getUfValue();
          tenPercentClp = Math.round(propertie.price * uf * 0.1);
        } else if (propertie.currency === '$') {
          tenPercentClp = Math.round(propertie.price * 0.1);
        }
        ctx.body = { ...propertie.toJSON(), ten_percent_clp: tenPercentClp };
        ctx.status = 200;

    } catch(error) {
        ctx.body = error;
        ctx.status = 400;
    }
})

module.exports = router;
