const Router = require("koa-router");

const router = new Router();

// {url}/properties mostrar propiedades max 25
router.get("index", "/", async (ctx) => {
    ctx.body = "Hola";
})

// {url}/properties/:id muestra una propiedad
router.get("index", "/", async (ctx) => {
    ctx.body = "Hola";
})

// {url}/properties?page=N&limit=25
router.get("index", "/", async (ctx) => {
    ctx.body = "Hola";
})

// {url}/properties?price=1000&location=maipu&date=2025-08-08
router.get("index", "/", async (ctx) => {
    ctx.body = "Hola";
})

module.exports = router;
