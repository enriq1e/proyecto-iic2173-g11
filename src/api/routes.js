const Router = require("@koa/router");
const properties = require("./routes/properties.js");
const purchases = require("./routes/purchases.js");
const eventLogs = require("./routes/eventLogs.js");
const wallet = require("./routes/wallet.js");

const router = new Router();

router.get("/", (ctx) => {
  ctx.body = "Ok Working";
});

router.use('/properties', properties.routes());
router.use('/wallet', wallet.routes());
router.use('/purchases', purchases.routes());   
router.use('/event-logs', eventLogs.routes());

module.exports = router;
