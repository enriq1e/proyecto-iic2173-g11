const Koa = require("koa");
const KoaLogger = require("koa-logger");
const { koaBody } = require("koa-body");
const cors = require("@koa/cors"); 
const authRoutes = require("./routes/auth");

const app = new Koa();

app.use(cors({ origin: "*" }));  
app.use(KoaLogger());
app.use(koaBody());

app.use(authRoutes.routes());
app.use(authRoutes.allowedMethods());

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Auth service running on port ${PORT}`);
});
