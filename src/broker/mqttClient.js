const mqtt = require("mqtt");
const axios = require("axios");
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
  client.subscribe(process.env.TOPIC, (error) => {
    if (error) {
      console.error("Error al suscribirse:", error);
    } else {
      console.log(`Suscrito a: ${process.env.TOPIC}`);
    }
  });
});

// Manejo de mensajes
client.on("message", async (topic, message) => {
  try {
    const data = JSON.parse(message.toString());
    await axios.post(`${process.env.API_URL}/properties`, data);
    console.log("Propiedad enviada a la api para post")
  } catch (error) {
    console.error("Error enviando propiedad a la API:", error.message);
  }
});

// Errores de conexion
client.on("error", (error) => {
  console.error("Error:", error);
});