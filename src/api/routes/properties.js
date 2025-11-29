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

router.get("show.one.propertie", "/:id", async (ctx) => {
    try {
        const propertie = await ctx.orm.Propertie.findByPk(ctx.params.id);
        if (!propertie) {
            ctx.body = "Not Found";
            ctx.status = 404;
            return;
        }

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

router.get("index", "/", async (ctx) => {
    try {
        console.log("➡️ GET /properties", ctx.query);

        // filtros
        const filters = {};

        // paginación y límite
        const page = parseInt(ctx.query.page) || 1;
        const limit = parseInt(ctx.query.limit) || 25;
        const offset = (page - 1) * limit;
        console.log(`📄 Página: ${page}, Límite: ${limit}, Offset: ${offset}`);

        // filtros por precio, lugar y fecha
        if (ctx.query.price) {
            const maxPrice = parseFloat(ctx.query.price);
            const UF_value = 40000;

            filters[Op.or] = [
                { currency: "$", price: { [Op.lt]: maxPrice } },
                Sequelize.where(
                    Sequelize.literal(`"Propertie"."currency" = 'UF' AND CAST("Propertie"."price" AS FLOAT) * ${UF_value}`),
                    { [Op.lt]: maxPrice }
                ),
            ];
            console.log("💰 Filtro por precio:", filters[Op.or]);
        }

        if (ctx.query.location) {
            filters.location = { [Op.iLike]: `%${ctx.query.location}%` };
            console.log("📍 Filtro por ubicación:", filters.location);
        }

        if (ctx.query.date) {
            filters[Op.and] = where(fn("DATE", col("timestamp")), ctx.query.date);
            console.log("📅 Filtro por fecha:", ctx.query.date);
        }

        const userFromState =
            ctx.state?.user?.email || ctx.state?.user?.mail || null;
        const userId = ctx.query.userId || ctx.query.user_id || userFromState;
        console.log("👤 userId detectado:", userId);

        let recommendedFirst = [];
        let excludeIds = [];

        if (userId) {
            console.log("🔎 Buscando recomendaciones del usuario:", userId);

            // Tomar las últimas 3 recomendaciones
            const recs = await ctx.orm.Recommendation.findAll({
                where: { userId },
                order: [["createdAt", "DESC"]],
                limit: 3,
            });

            console.log(`📌 Se encontraron ${recs.length} registros de recomendaciones`);

            let recIds = [];
            for (const r of recs) {
                console.log("📝 Recommendation entry:", r.toJSON());
                if (r.recommendationIds) {
                    const ids = typeof r.recommendationIds === "string" ? JSON.parse(r.recommendationIds) : r.recommendationIds;
                    recIds.push(...ids);
                }
            }

            console.log("✅ IDs de propiedades recomendadas:", recIds);

            if (recIds.length) {
                const recProps = await ctx.orm.Propertie.findAll({
                    where: { id: recIds },
                });
                console.log(`🏠 Se encontraron ${recProps.length} propiedades recomendadas`);

                recommendedFirst = recProps.map((p) => ({
                    ...p.toJSON(),
                    recommended: true,
                }));

                excludeIds = recIds;
                console.log("🔒 Excluyendo IDs de propiedades recomendadas del resto:", excludeIds);
            } else {
                console.log("⚠️ No hay IDs de propiedades recomendadas válidos");
            }
        } else {
            console.log("⚠️ No se detectó userId, se omiten recomendaciones");
        }

        // Propiedades restantes
        const whereRest = { ...filters };
        if (excludeIds.length) {
            whereRest.id = { [Op.notIn]: excludeIds };
        }

        console.log("📋 Consulta de propiedades restantes:", whereRest);

        const rest = await ctx.orm.Propertie.findAll({
            where: whereRest,
            limit,
            offset,
            order: [["timestamp", "DESC"]],
        });

        console.log(`🏘 Se encontraron ${rest.length} propiedades restantes`);

        ctx.body = [...recommendedFirst, ...rest.filter(p => !excludeIds.includes(p.id))];
        ctx.status = 200;
    } catch (error) {
        console.error("❌ Error en GET /properties:", error);
        ctx.body = { error: error.message || error };
        ctx.status = 400;
    }
});




module.exports = router;
