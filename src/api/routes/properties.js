const Router = require("koa-router");

const router = new Router();

router.get("index", "/", async (ctx) => {
    try {
        const page = parseInt(ctx.query.page) || 1;
        const limit = 25;
        const offset = (page - 1) * limit;

        const properties = await ctx.orm.Propertie.findAll({ limit, offset});

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



/*
// {url}/properties?price=1000&location=maipu&date=2025-08-08
router.get("index", "/", async (ctx) => {
    try {
        const page = parseInt(ctx.query.page) || 1;
        const limit = 25;
        const offset = (page - 1) * limit;

        const properties = await ctx.orm.Propertie.findAll({ limit, offset});

        ctx.body = properties;
        ctx.status = 200;
    } catch (error) {
        ctx.body = error;
        ctx.status = 400;
    }
})
*/

module.exports = router;
