const Router = require("@koa/router");
const properties = require("./routes/properties.js");
const wallet = require("./routes/wallet.js");
const purchases = require("./routes/purchases.js");

const router = new Router();
router.get('/', (ctx) => { ctx.body = { ok: true }; });


router.use('/properties', properties.routes());
router.use('/wallet', wallet.routes());
router.use('/purchases', purchases.routes());   

module.exports = router;