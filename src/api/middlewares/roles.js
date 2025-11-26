const isUser = async (ctx, next) => {
  const user = ctx.state.user;

  if (!user) {
    ctx.status = 401;
    ctx.body = {
      code: "NOT_AUTHENTICATED",
      error: "No autenticado",
      allowed: false
    };
    return;
  }

  if (user.role !== "user" && user.role !== "admin") {
    ctx.status = 403;
    ctx.body = {
      code: "NOT_USER",
      error: "Acceso permitido solo para usuarios",
      allowed: false
    };
    return;
  }

  await next();
};


const isAdmin = async (ctx, next) => {
  const user = ctx.state.user;

  if (!user) {
    ctx.status = 401;
    ctx.body = {
      code: "NOT_AUTHENTICATED",
      error: "No autenticado",
      allowed: false
    };
    return;
  }

  if (user.role !== "admin") {
    ctx.status = 403;
    ctx.body = {
      code: "NOT_ADMIN",
      error: "Acceso permitido solo para administradores",
      allowed: false
    };
    return;
  }

  await next();
};

module.exports = { isUser, isAdmin };
