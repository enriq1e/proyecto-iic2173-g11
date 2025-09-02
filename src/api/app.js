const Koa = require("koa");
const KoaLogger = require("koa-logger");
const { koaBody } = require("koa-body");
const router = require("./routes.js");
const orm = require("../models");

const app = new Koa();
app.context.orm = orm;

// Middlewares
app.use(KoaLogger());
app.use(koaBody());

// Rutas
router.get("/", (ctx) => {
  ctx.body = "K-On! >> SNK";
});

// Router
app.use(router.routes());
app.use(router.allowedMethods());

module.exports = app;