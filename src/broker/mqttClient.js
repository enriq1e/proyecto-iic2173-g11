const mqtt = require("mqtt");
const axios = require("axios");
const dotenv = require("dotenv");
const { randomUUID } = require("crypto");
const { withFibRetry } = require("../api/utils/retry");

dotenv.config();

const ROLE = process.env.ROLE || "api";
const isBroker = ROLE === "broker";

// Conexión MQTT
const client = mqtt.connect({
  host: process.env.HOST,
  port: Number(process.env.BROKER_PORT),
  protocol: "mqtt",
  protocolVersion: 4,
  clean: true,
  keepalive: 30,
  reconnectPeriod: 2000,
  resubscribe: true,
  username: process.env.USER,
  password: process.env.PASSWORD,
  clientId: "mqttjs_g11_" + Math.random().toString(16).slice(2, 8),
});

// Publicar con promesas
function publishAsync(topic, payload) {
  return new Promise((resolve, reject) => {
    client.publish(topic, payload, (err) => (err ? reject(err) : resolve()));
  });
}

// Loguear evento a API
async function logEventToApi(payload) {
  try {
    await withFibRetry(
      () => axios.post(`${process.env.API_URL}/event-logs`, payload),
      { maxRetries: 6, baseDelayMs: 1000 }
    );
  } catch (err) {
    console.error("Error POST /event-logs:", err.response?.data || err.message);
  }
}

// ----- CONEXIÓN: diferenciar por rol -----
client.on("connect", async () => {
  if (!isBroker) {
    console.log("MQTT publisher listo (modo API)");
    return; // en modo API no nos suscribimos
  }

  console.log("Broker conectado");

  // properties/info
  try {
    await withFibRetry(
      () =>
        new Promise((res, rej) => {
          client.subscribe(process.env.TOPIC, { qos: 1 }, (err) =>
            err ? rej(err) : res()
          );
        }),
      { maxRetries: 5, baseDelayMs: 1000 }
    );
    console.log(`Suscrito: ${process.env.TOPIC}`);
  } catch (err) {
    console.error(`Suscripción fallida (${process.env.TOPIC}):`, err.message);
  }

  // properties/requests
  try {
    await withFibRetry(
      () =>
        new Promise((res, rej) => {
          client.subscribe(process.env.TOPIC_REQUEST, { qos: 1 }, (err) =>
            err ? rej(err) : res()
          );
        }),
      { maxRetries: 5, baseDelayMs: 1000 }
    );
    console.log(`Suscrito: ${process.env.TOPIC_REQUEST}`);
  } catch (err) {
    console.error(
      `Suscripción fallida (${process.env.TOPIC_REQUEST}):`,
      err.message
    );
  }

  // properties/validation
  try {
    await withFibRetry(
      () =>
        new Promise((res, rej) => {
          client.subscribe(process.env.TOPIC_VALIDATION, { qos: 1 }, (err) =>
            err ? rej(err) : res()
          );
        }),
      { maxRetries: 5, baseDelayMs: 1000 }
    );
    console.log(`Suscrito: ${process.env.TOPIC_VALIDATION}`);
  } catch (err) {
    console.error(
      `Suscripción fallida (${process.env.TOPIC_VALIDATION}):`,
      err.message
    );
  }
});

// Publicar solicitud de compra 
function sendPurchaseRequest(propertyUrl, requestId) {
  const purchaseRequest = {
    request_id: requestId || randomUUID(),
    group_id: Number(process.env.GROUP_ID),
    timestamp: new Date().toISOString(),
    url: propertyUrl,
    origin: 0,
    operation: "BUY",
  };

  return withFibRetry(
    () => publishAsync(process.env.TOPIC_REQUEST, JSON.stringify(purchaseRequest)),
    { maxRetries: 6, baseDelayMs: 1000 }
  )
    .then(() => {
      console.log("Solicitud enviada:", purchaseRequest.request_id);
      return purchaseRequest.request_id;
    })
    .catch((err) => {
      console.error("Error publicando solicitud:", err.message);
      throw err;
    });
}

if (isBroker) {
  client.on("message", async (topic, message) => {
    try {
      const data = JSON.parse(message.toString());

      if (topic === process.env.TOPIC) {
        // Mensaje de properties/info - nueva propiedad
        await withFibRetry(
          () => axios.post(`${process.env.API_URL}/properties`, data),
          { maxRetries: 6, baseDelayMs: 1000 }
        );
        console.log("Propiedad guardada");
        await logEventToApi({
          topic,
          event_type: "INFO",
          timestamp: data.timestamp,
          url: data.url,
          raw: data,
        });

      } else if (topic === process.env.TOPIC_REQUEST) {
        // Canal compartido - procesar TODAS las solicitudes
        await logEventToApi({
          topic,
          event_type: "REQUEST",
          timestamp: data.timestamp,
          url: data.url,
          request_id: data.request_id,
          group_id: data.group_id,
          origin: data.origin,
          operation: data.operation,
          raw: data,
        });

        // reserva idempotente local mientras valida
        try {
          await withFibRetry(
            () =>
              axios.post(`${process.env.API_URL}/purchases/reserve-from-request`, {
                request_id: data.request_id,
                url: data.url,
              }),
            { maxRetries: 5, baseDelayMs: 1000 }
          );
        } catch (e) {
          console.error(
            "No se pudo reservar desde REQUEST:",
            e.response?.data || e.message
          );
        }

      } else if (topic === process.env.TOPIC_VALIDATION) {
        const status = String(data.status || "").toUpperCase();

        await logEventToApi({
          topic,
          event_type: "VALIDATION",
          timestamp: data.timestamp,
          url: data.url || null,
          request_id: data.request_id,
          status,
          reason: data.reason || null,
          raw: data,
        });

        try {
          await withFibRetry(
            () =>
              axios.post(`${process.env.API_URL}/purchases/settle-from-validation`, {
                request_id: data.request_id,
                status,
              }),
            {
              maxRetries: 5,
              baseDelayMs: 1000,
              shouldRetry: (err) => {
                const code = err?.response?.status;
                return !code || code >= 500;
              },
            }
          );
          console.log(`VALIDATION aplicada (${status})`);
        } catch (err) {
          console.error(
            "Error aplicando VALIDATION:",
            err.response?.data || err.message
          );
        }
      }
    } catch (error) {
      console.error("Error procesando mensaje:", error.message);
    }
  });
}

client.on("error", (error) => console.error("MQTT error:", error.message));

module.exports = { sendPurchaseRequest };

