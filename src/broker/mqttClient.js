import mqtt from "mqtt";
import dotenv from "dotenv";
/*
import { sequelize, Property } from "./db.js";
*/

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


// Recibir mensajes
client.on("message", async (topic, message) => {
  try {
    console.log("Mensaje recibido:", message.toString());

    // Parsear JSON (los mensajes llegan como string JSON)
    const data = JSON.parse(message.toString());

    /*
    // VER SI YA EXISTE ANTES DE GUARDAR
    // Guardar en DB
    await Property.create({
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
    });
    */

    console.log("Propiedad guardada en la base de datos");
  } catch (err) {
    console.error("Error procesando mensaje:", err.message);
  }
});


// En caso de errores de conexión
client.on("error", (err) => {
  console.error("Error en conexion:", err);
});
