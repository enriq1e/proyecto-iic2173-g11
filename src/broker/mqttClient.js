const mqtt = require("mqtt");
const axios = require("axios");
const dotenv = require("dotenv");
const { randomUUID } = require('crypto');
// const { v4: uuidv4 } = require('uuid') tiraba error

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

// Logear eventos en la API
async function logEventToApi(payload) {
  try {
    await axios.post(`${process.env.API_URL}/event-logs`, payload);
  } catch (err) {
    console.error("Error POST /event-logs:", err.response?.data || err.message);
  }
}

// Conectarse al broker
client.on("connect", () => {
  console.log("Conectado al broker");

  // Suscribirse a properties/info  
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

  // Suscribirse a properties/validation
  client.subscribe(process.env.TOPIC_VALIDATION, (error) => {
    if (error) console.error("Error al suscribirse a", process.env.TOPIC_VALIDATION, ":", error);
    else console.log(`Suscrito a: ${process.env.TOPIC_VALIDATION}`);
  });
});

// Función para enviar solicitud de compra
function sendPurchaseRequest(propertyUrl) {
  const purchaseRequest = {
    request_id: randomUUID(),
    group_id: process.env.GROUP_ID,
    timestamp: new Date().toISOString(),
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

      // Logear evento
      await logEventToApi({
        topic,
        event_type: 'INFO',
        timestamp: data.timestamp,
        url: data.url,
        raw: data
      });
      
    } else if (topic === process.env.TOPIC_REQUEST) {
      // logeamos y esperamos la validación
      await logEventToApi({
        topic,
        event_type: 'REQUEST',
        timestamp: data.timestamp,
        url: data.url,
        request_id: data.request_id,
        group_id: data.group_id,
        origin: data.origin,
        operation: data.operation,
        raw: data
      });
    } else if (topic === process.env.TOPIC_VALIDATION) {
      // Mensaje de properties/validation - respuesta a solicitud de compra
      const status = String(data.status || '').toUpperCase();
      
      // Logeamos validación
      await logEventToApi({
        topic,
        event_type: 'VALIDATION',
        timestamp: data.timestamp,
        url: data.url || null,
        request_id: data.request_id,
        status,
        reason: data.reason || null,
        raw: data
      });

      if (status === 'ACCEPTED' || status === 'OK') {
        try {
          // Reducir offers
          await axios.post(`${process.env.API_URL}/purchases/reduce-offers`, {
            property_url: data.url,
            operation: "REDUCE"
          });
          console.log(`Offers reducidas tras validación (OK/ACCEPTED) por solicitud del grupo: ${data.group_id}`);
        } catch (err) {
          console.error(`Error reduciendo offers tras validación para grupo ${data.group_id}:`, err.response?.data || err.message);
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

module.exports = { sendPurchaseRequest };