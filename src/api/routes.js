const Router = require("@koa/router");
const properties = require("./routes/properties.js");
const purchases = require("./routes/purchases.js");
const eventLogs = require("./routes/eventLogs.js");
const wallet = require("./routes/wallet.js");
const internal = require("./routes/internal.js");

const router = new Router();

router.get("/", (ctx) => {
  ctx.body = "530";
});

router.use('/properties', properties.routes());
router.use('/wallet', wallet.routes());
router.use('/purchases', purchases.routes());   
router.use('/event-logs', eventLogs.routes());
router.use('/internal', internal.routes());

module.exports = router;
