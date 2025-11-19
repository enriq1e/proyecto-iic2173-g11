const Koa = require("koa");
const KoaLogger = require("koa-logger");
const { koaBody } = require("koa-body");
const cors = require("@koa/cors");
const router = require("./routes.js");
const orm = require("../models");

const app = new Koa();
app.context.orm = orm;

// Middlewares
app.use(cors({ 
  origin: "*",
  allowHeaders: ['Content-Type', 'Authorization', 'authorization'],
  exposeHeaders: ['Authorization'],
  credentials: true
}));
app.use(KoaLogger());
app.use(koaBody());

// Rutas
app.use(router.routes());
app.use(router.allowedMethods());

module.exports = app;
