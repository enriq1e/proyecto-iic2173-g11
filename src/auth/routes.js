const Router = require("@koa/router");
const auth = require("./routes/auth.js");

const router = new Router();

router.get("/", (ctx) => {
  ctx.body = "530";
});

router.use(auth.routes());

module.exports = router;
