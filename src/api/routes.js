const Router = require("@koa/router");
const properties = require("./routes/properties.js");
const purchases = require("./routes/purchases.js");
const eventLogs = require("./routes/eventLogs.js");

const router = new Router();

router.use('/properties', properties.routes());
router.use('/purchases', purchases.routes());
router.use('/event-logs', eventLogs.routes());

module.exports = router;