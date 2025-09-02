const app = require("./app");
const db = require("../models");
const dotenv = require("dotenv");

dotenv.config();

const PORT = process.env.PORT || 3001;

db.sequelize
    .authenticate()
    .then(() => {
        console.log("Conexion con la base de datos exitosa");
        app.listen(PORT, (err) => {
            if (err) {
                return console.error("Fallo", err);
            }
            console.log(`Escuchando en puerto: ${PORT}`);
            return app;
        });
    })
    .catch((err) => console.error("Incapaz de conectarse a la base de datos:", err));