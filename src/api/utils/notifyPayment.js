const { sendPaymentEmail } = require("./email");

function emailTemplate(status, { name, url }, reason) {
  const base = {
    ACCEPTED: {
      subject: "Pago confirmado",
      body: `<h3>¡Pago validado!</h3>
             <p>Tu agendamiento para <b>${name}</b> fue confirmado.</p>
             <p><a href="${url}" target="_blank">Ver propiedad</a></p>`
    },
    REJECTED: {
      subject: "Pago rechazado",
      body: `<h3>Lo sentimos</h3>
             <p>Tu pago fue rechazado.${reason ? ` Motivo: ${reason}` : ""}</p>`
    },
    OK: {
      subject: "Pago recibido",
      body: `<p>Recibimos tu pago para <b>${name}</b>, estamos finalizando el proceso.</p>`
    },
    ERROR: {
      subject: "Error en el pago",
      body: `<p>Ocurrió un problema procesando tu pago.${reason ? ` Detalle: ${reason}` : ""}</p>`
    }
  };
  return base[status] || { subject: "Estado de tu pago", body: `<p>Estado: ${status}</p>` };
}

async function alreadyNotified(EventLog, request_id) {
  const exists = await EventLog.findOne({ where: { request_id, event_type: "EMAIL_SENT" } });
  return Boolean(exists);
}

async function markNotified(EventLog, request_id, status) {
  await EventLog.create({
    topic: "properties/validation",
    event_type: "EMAIL_SENT",
    timestamp: new Date().toISOString(),
    request_id,
    status,
    raw: {}
  });
}

/**
 * Busca la PurchaseIntent por request_id, arma el correo y lo envía.
 * Usa EventLog para idempotencia (evitar correos duplicados).
 */
async function notifyPayment(orm, request_id, status, reason = null) {
  const s = String(status || "").toUpperCase();

  // Idempotencia de correo
  if (await alreadyNotified(orm.EventLog, request_id)) return;

  const intent = await orm.PurchaseIntent.findOne({ where: { request_id } });
  if (!intent) return; // nada que notificar si no encontramos el intent

  const property = await orm.Propertie.findByPk(intent.propertieId);
  const email = intent.email;
  const { subject, body } = emailTemplate(s, { name: property?.name || "tu propiedad", url: property?.url || "#" }, reason);

  await sendPaymentEmail(email, subject, body);
  await markNotified(orm.EventLog, request_id, s);
}

module.exports = { notifyPayment };
