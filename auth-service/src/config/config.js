require("dotenv").config();

module.exports = {
  development: {
    username: process.env.AUTH_DB_USER,
    password: process.env.AUTH_DB_PASS,
    database: process.env.AUTH_DB_NAME,
    host: process.env.AUTH_DB_HOST,
    dialect: "postgres",
  },
  production: {
    username: process.env.AUTH_DB_USER,
    password: process.env.AUTH_DB_PASS,
    database: process.env.AUTH_DB_NAME,
    host: process.env.AUTH_DB_HOST,
    dialect: "postgres",
  },
};
