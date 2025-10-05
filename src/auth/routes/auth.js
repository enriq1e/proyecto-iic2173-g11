const Router = require("@koa/router");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

const router = new Router();

router.post("/signup", async (ctx) => {
  const { username, email, password } = ctx.request.body;
  try {
    const existingUser = await ctx.orm.User.findOne({ where: { email } });
    if (existingUser) {
      ctx.status = 400;
      ctx.body = { error: "El correo ya está registrado" };
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await ctx.orm.User.create({
      username,
      email,
      password: hashedPassword,
    });

    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "1h", audience: "myapp", issuer: "myapp" }
    );

    ctx.status = 200;
    ctx.body = { access_token: token };
  } catch (err) {
    ctx.status = 500;
    ctx.body = { error: "Error al registrar usuario", details: err.message };
  }
});

router.post("/login", async (ctx) => {
  const { email, password } = ctx.request.body;

  const user = await ctx.orm.User.findOne({ where: { email } });
  if (!user) {
    ctx.status = 401;
    ctx.body = { error: "Usuario no encontrado" };
    return;
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    ctx.status = 401;
    ctx.body = { error: "Contrasena incorrecta" };
    return;
  }

  const token = jwt.sign(
    { id: user.id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: "1h", audience: "myapp", issuer: "myapp" }
  );

  ctx.status = 200;
  ctx.body = { access_token: token };
});

module.exports = router;
