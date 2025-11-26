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
  origin: (ctx) => ctx.get('Origin') || 'https://app.propiedadesarquisis.me',
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposeHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  maxAge: 86400,
}));

// Parche: asegurar que siempre salga el header
app.use(async (ctx, next) => {
  await next();
  const origin = ctx.get('Origin') || 'https://app.propiedadesarquisis.me';
  ctx.set('Access-Control-Allow-Origin', origin);
  ctx.set('Access-Control-Allow-Credentials', 'true');
});

// Responder OPTIONS para evitar 404 en preflight
app.use(async (ctx, next) => {
  if (ctx.method === 'OPTIONS') {
    ctx.status = 204;
    return;
  }
  await next();
});

app.use(KoaLogger());
app.use(koaBody());

// Rutas
app.use(router.routes()).use(router.allowedMethods());

module.exports = app;
