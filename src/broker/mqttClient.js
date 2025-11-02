const mqtt = require("mqtt");
const axios = require("axios");
const dotenv = require("dotenv");
const { randomUUID } = require("crypto");
const { withFibRetry } = require("../api/utils/retry");
const processedRequests = new Set(); 
const orm = require("../models");
const { notifyPayment } = require("../api/utils/notifyPayment");


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
  console.log("🟢 Registrando EventLog:", payload.event_type, payload.url);
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
function sendPurchaseRequest(propertyUrl, requestId, deposit_token) {
  const purchaseRequest = {
    request_id: requestId || randomUUID(),
    deposit_token: deposit_token,
    group_id: String(process.env.GROUP_ID),
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

function sendValidationResult(status, requestId, reason = null) {
  const validationMessage = {
    request_id: requestId,
    status,
    reason,
    timestamp: new Date().toISOString()};
  return withFibRetry(
    () => publishAsync(process.env.TOPIC_VALIDATION, JSON.stringify(validationMessage)),
    { maxRetries: 6, baseDelayMs: 1000 }
  ).then(() => {
    console.log("Validación enviada:", requestId, status);
  }
  ).catch((err) => {
    console.error("Error publicando validación:", err.message);
    throw err;});
}

if (isBroker) {
  client.on("message", async (topic, message) => {
    try {
      const data = JSON.parse(message.toString());
      // Idempotencia por request_id y topic
      const key = `${topic}:${data.request_id}`;
      if (data.request_id && processedRequests.has(key)) {
        return;
      }
      if (data.request_id) processedRequests.add(key);

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
        const key = `${topic}:${data.request_id}`;
        if (data.request_id && processedRequests.has(key)) {
          console.log(`[MQTT] Ignorando REQUEST duplicada: ${data.request_id}`);
          return;
        }
        if (data.request_id) processedRequests.add(key);
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

        // Procesar solo si pertenece a mi grupo
        if (data.group_id !== String(process.env.GROUP_ID)) {
          console.log(`[MQTT] Ignorando procesamiento de otro grupo (${data.group_id})`);
          return;
        }

        // reserva idempotente local mientras valida
        try {
          await withFibRetry(
            () =>
              axios.post(`${process.env.API_URL}/purchases/reserve-from-request`, {
                request_id: data.request_id,
                url: data.url,
              }),
            {
              maxRetries: 3,
              baseDelayMs: 1000,
              shouldRetry: (err) => {
                const code = err?.response?.status;
                return !code || code >= 500;
              },
            }
          );
        } catch (e) {
          console.error(
            "No se pudo reservar desde REQUEST:",
            e.response?.data || e.message
          );
        }

      // Manejo de mensajes de validación
      } else if (topic === process.env.TOPIC_VALIDATION) {
        const status = String(data.status || "").toUpperCase();
        const requestId = data.request_id;
        let propertyUrl = null;

        console.log(`🟢 VALIDATION recibida: ${requestId} (${status})`);

        // Buscar request_id 
        try {
          const res = await axios.get(`${process.env.API_URL}/event-logs/by-request/${requestId}`);
          propertyUrl = res.data?.url || null;
        } catch {
          console.warn(`[MQTT] No se encontró EventLog previo para request_id ${requestId}`);
        }
        // Eventlog validation
        await logEventToApi({
          topic,
          event_type: "VALIDATION",
          timestamp: data.timestamp,
          url: propertyUrl,
          request_id: requestId,
          status,
          reason: data.reason || null,
          raw: data,
        });

        // actualizar estado purchaseintent segun compra
        try {
          const normalizedStatus = (() => {
            switch (String(data.status || "").toUpperCase()) {
              case "ACCEPTED":
                return "ACCEPTED";
              case "OK":
                return "PENDING";
              case "ERROR":
                return "ERROR";
              case "REJECTED":
                return "REJECTED";
              default:
                return "UNKNOWN";
            }
          })();

          await withFibRetry(
            () => axios.patch(
              `${process.env.API_URL}/purchases/purchase-intents/${requestId}/status`, 
              { status: normalizedStatus }
            ),
            { maxRetries: 5, baseDelayMs: 1000 }
          );

          console.log(`🟢 PurchaseIntent ${requestId} actualizado a ${normalizedStatus}`);
        } catch (err) {
          console.error("Error actualizando estado de PurchaseIntent:", err.response?.data || err.message);
        }

        try {
          await notifyPayment(orm, requestId, status, data.reason || null);
          console.log(`🟢 Email de pago notificado para ${requestId} (${status})`);
        } catch (mailErr) {
          console.error("Error notificando email de pago:", mailErr.message);
        }

        if (status === "ACCEPTED") {
          try {
            await withFibRetry(
              () => axios.post(`${process.env.API_URL}/purchases/reduce-offers`, { property_url: propertyUrl }),
              { maxRetries: 3, baseDelayMs: 1000 }
            );
            console.log(`[MQTT] Oferta reducida para ${propertyUrl}`);
          } catch (err) {
            console.error("Error al reducir oferta:", err.response?.data || err.message);
          }
        }

        try {
          await withFibRetry(
            () =>
              axios.post(`${process.env.API_URL}/purchases/settle-from-validation`, {
                request_id: requestId,
                status,
              }),
            { maxRetries: 5, baseDelayMs: 1000 }
          );
          console.log(`✅ VALIDATION enviada (${status})`);
        } catch (err) {
          console.error("Error aplicando VALIDATION:", err.response?.data || err.message);
        }
      }
    } catch (error) {
      console.error("Error procesando mensaje:", error.message);
    }
  });
}

client.on("error", (error) => console.error("MQTT error:", error.message));

module.exports = { sendPurchaseRequest, sendValidationResult };