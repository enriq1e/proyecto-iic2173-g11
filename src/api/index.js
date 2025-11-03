// Carga opcional de New Relic: solo enciéndelo cuando esté habilitado y disponible
try {
    if (process.env.NEW_RELIC_ENABLED === 'true') {
        // eslint-disable-next-line import/no-extraneous-dependencies, global-require
        require('newrelic');
        console.log('[APM] New Relic habilitado');
    } else {
        console.log('[APM] New Relic deshabilitado (NEW_RELIC_ENABLED!=true)');
    }
} catch (e) {
    console.warn('[APM] Módulo newrelic no encontrado; continuando sin APM');
}
const app = require("./app");
const db = require("../models");

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
