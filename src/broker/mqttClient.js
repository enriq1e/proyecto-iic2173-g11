const mqtt = require("mqtt");
const db = require("../models");
const dotenv = require("dotenv");

dotenv.config();

// Crear cliente
const client = mqtt.connect({
  clientId: "mqttjs_enriq1_" + Math.random().toString(16).substring(2, 8),
  username: process.env.USERNAME,
  password: process.env.PASSWORD,
  host: process.env.HOST,
  port: Number(process.env.BROKER_PORT),
  protocol: "mqtt"
});

// Conectarse al broker
client.on("connect", () => {
  console.log("Conectado al broker");
  client.subscribe(process.env.TOPIC, (err) => {
    if (err) {
      console.error("Error al suscribirse:", err);
    } else {
      console.log(`Suscrito a: ${process.env.TOPIC}`);
    }
  });
});


// Manejo de mensajes
client.on("message", async (topic, message) => {
  try {
    const data = JSON.parse(message.toString());

    // Buscamos si existe una propiedad igual a la que estamos insertando
    const existing = await db.Propertie.findOne({
      where: { url: data.url, name: data.name }
    });

    if (existing) 
    {
      // Si existe actualizamos offers y timestamp
      await existing.update({
        offers: existing.offers + 1,
        timestamp: new Date(data.timestamp),
      });
      console.log("Propiedad actualizada:", existing.name);
    } 
    else 
    {
      // Si no existe creamos una nueva
      await db.Propertie.create({
        name: data.name,
        price: data.price,
        currency: data.currency,
        bedrooms: data.bedrooms,
        bathrooms: data.bathrooms,
        m2: data.m2,
        location: data.location,
        img: data.img,
        url: data.url,
        is_project: data.is_project,
        timestamp: new Date(data.timestamp),
        offers: 1,
      });
      console.log("Propiedad creada:", data.name);
    }

  } catch (err) {
    console.error("Error procesando mensaje:", err.message);
  }
});


// Errores de conexion
client.on("error", (err) => {
  console.error("Error:", err);
});
