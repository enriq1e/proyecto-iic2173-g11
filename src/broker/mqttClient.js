const mqtt = require("mqtt");
const axios = require("axios");
const dotenv = require("dotenv");
const { v4: uuidv4 } = require('uuid');

dotenv.config();

// Crear cliente
const client = mqtt.connect({
  clientId: "mqttjs_g11_" + Math.random().toString(16).substring(2, 8),
  username: process.env.USER,
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
  
  // Suscribirse a properties/requests
  client.subscribe(process.env.TOPIC_REQUEST, (error) => {
    if (error) {
      console.error("Error al suscribirse a", process.env.TOPIC_REQUEST, ":", error);
    } else {
      console.log(`Suscrito a: ${process.env.TOPIC_REQUEST}`);
    }
  });
});

// Función para enviar solicitud de compra
function sendPurchaseRequest(propertyUrl, token) {
  const purchaseRequest = {
    request_id: uuidv4(),
    group_id: process.env.GROUP_ID,
    timestamp: new Date().toISOString(),
    deposit_token: token,
    url: propertyUrl,
    origin: 0,
    operation: "BUY"
  };

  console.log("Enviando solicitud de compra:", purchaseRequest);
  
  client.publish(process.env.TOPIC_REQUEST, JSON.stringify(purchaseRequest), (error) => {
    if (error) {
      console.error('Error enviando solicitud de compra:', error);
    } else {
      console.log('Solicitud de compra enviada:', purchaseRequest.request_id);
    }
  });
}

// Manejo de mensajes
client.on("message", async (topic, message) => {
  try {
    const data = JSON.parse(message.toString());
    console.log(`Mensaje recibido en ${topic}:`, data);
    
    if (topic === process.env.TOPIC) {
      // Mensaje de properties/info - nueva propiedad
      await axios.post(`${process.env.API_URL}/properties`, data);
      console.log("Propiedad enviada a la API para guardar");
      
    } else if (topic === process.env.TOPIC_REQUEST) {
      // Canal compartido - procesar TODAS las solicitudes
      console.log(`Solicitud recibida del grupo: ${data.group_id} | Operación: ${data.operation}`);
      
      if (data.operation === "BUY") {
        try {
          await axios.post(`${process.env.API_URL}/purchases/reduce-offers`, {
            property_url: data.url,
            operation: "REDUCE"
          });
          console.log(`Offers reducidas por solicitud del grupo: ${data.group_id}`);
        } catch (error) {
          console.error(`Error reduciendo offers para grupo ${data.group_id}:`, error.response?.data);
        }
      
      }
    }
    
  } catch (error) {
    console.error("Error procesando mensaje:", error.message);
  }
});

// Errores de conexion
client.on("error", (error) => {
  console.error("Error:", error);
});

module.exports = { sendPurchaseRequest, client };