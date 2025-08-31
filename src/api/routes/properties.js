const Router = require("koa-router");
const { Op, fn, col, where } = require("sequelize");

const router = new Router();

router.get("index", "/", async (ctx) => {
    try {
        // filtros
        const filters = {};

        // paginacion y limite de 25
        const page = parseInt(ctx.query.page) || 1;
        const limit = 25;
        const offset = (page - 1) * limit;

        // filtros por precio, lugar y fecha
        if (ctx.query.price) {
            filters.price = { [Op.lt]: parseFloat(ctx.query.price) };
        }
        if (ctx.query.location) {
            filters.location = { [Op.iLike]: `%${ctx.query.location}%` };
        }
        if (ctx.query.date) {
            filters[Op.and] = where(
                fn("DATE", col("timestamp")),
                ctx.query.date
            );
        }

        // aplicamos los filtros y buscamos
        const properties = await ctx.orm.Propertie.findAll({ 
            where: filters,
            limit,
            offset,
            order:[["timestamp", "DESC"]]
        });

        ctx.body = properties;
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
        ctx.body = propertie;
        ctx.status = 200;
    } catch(error) {
        ctx.body = error;
        ctx.status = 400;
    }
})

module.exports = router;
