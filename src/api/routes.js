const Router = require("@koa/router");
const properties = require("./routes/properties.js");

const router = new Router();

router.use('/properties', properties.routes());

module.exports = router;
