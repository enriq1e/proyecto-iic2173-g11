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
      console.log('[recommendations] decoded token payload:', decoded);
    } catch (err) {
      ctx.status = 401;
      ctx.body = { error: 'Invalid or expired token' };
      return;
    }

    // Extraer userId del token (puede ser sub, id, email, mail)
    const userId = decoded.sub || decoded.id || decoded.email || decoded.mail;
    console.log('[recommendations] resolved userId:', userId);
    if (!userId) {
      ctx.status = 400;
      ctx.body = { error: 'Token does not contain userId' };
      return;
    }

    const recs = await ctx.orm.Recommendation.findAll({
      where: { userId: String(userId) },
      order: [['createdAt', 'DESC']],
    });

    // Normalizar recommendationIds -> array antes de enviar
    const normalized = recs.map(r => {
      const plain = r.get ? r.get({ plain: true }) : r;
      let ids = plain.recommendationIds;
      if (!Array.isArray(ids)) {
        try {
          ids = ids ? JSON.parse(ids) : [];
        } catch (e) {
          ids = [];
        }
      }
      plain.recommendationIds = Array.isArray(ids) ? ids : [];
      return plain;
    });

    console.log('[recommendations] returned count:', normalized.length, 'samples:', normalized.slice(0,3));
    ctx.body = normalized;
  } catch (err) {
    console.error('GET /recommendations error:', err);
    ctx.status = 500;
    ctx.body = { error: 'Internal error' };
  }
});

module.exports = router;