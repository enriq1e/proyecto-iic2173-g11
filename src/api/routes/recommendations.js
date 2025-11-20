const Router = require('@koa/router');
const jwt = require('jsonwebtoken');

const router = new Router();

// GET /recommendations - extrae userId del token JWT
router.get('/', async (ctx) => {
  try {
    // Extraer token del header Authorization
    const authHeader = ctx.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      ctx.status = 401;
      ctx.body = { error: 'Missing or invalid Authorization header' };
      return;
    }

    const token = authHeader.split(' ')[1];
    const secret = process.env.JWT_SECRET || 'your-secret-key';
    
    let decoded;
    try {
      decoded = jwt.verify(token, secret);
    } catch (err) {
      ctx.status = 401;
      ctx.body = { error: 'Invalid or expired token' };
      return;
    }

    // Extraer userId del token (puede ser sub, id, email, mail)
    const userId = decoded.sub || decoded.id || decoded.email || decoded.mail;
    if (!userId) {
      ctx.status = 400;
      ctx.body = { error: 'Token does not contain userId' };
      return;
    }

    const recs = await ctx.orm.Recommendation.findAll({
      where: { userId: String(userId) },
      order: [['createdAt', 'DESC']],
    });

    ctx.body = recs;
  } catch (err) {
    console.error('GET /recommendations error:', err);
    ctx.status = 500;
    ctx.body = { error: 'Internal error' };
  }
});

module.exports = router;