const Router = require('@koa/router');

const router = new Router();

router.post('/', async (ctx) => {
  try {
    const {
      topic, event_type, timestamp, url,
      request_id, group_id, origin, operation,
      status, reason, raw
    } = ctx.request.body;

    // creamos evento
    const row = await ctx.orm.EventLog.create({
      topic,
      event_type,
      timestamp: timestamp ? new Date(timestamp) : null,
      url: url || null,
      request_id: request_id || null,
      group_id: group_id || null,
      origin: (typeof origin === 'number') ? origin : null,
      operation: operation || null,
      status: status || null,
      reason: reason || null,
      raw
    });

    ctx.status = 201;
    ctx.body = row;
  } catch (err) {
    ctx.status = 400;
    ctx.body = { error: 'cannot log event', details: err.message };
  }
});

module.exports = router;
