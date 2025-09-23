const jwt = require("jsonwebtoken");

const authenticate = async (ctx, next) => {
  const authHeader = ctx.headers["authorization"];
  if (!authHeader) {
    ctx.status = 401;
    ctx.body = { error: "Token requerido" };
    return;
  }

  const token = authHeader.split(" ")[1];
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET, {
      issuer: "myapp",
      audience: "myapp",
    });
    ctx.state.user = payload;
    await next();
  } catch (err) {
    ctx.status = 403;
    ctx.body = { error: "Token inválido", details: err.message };
  }
};

module.exports = authenticate;
