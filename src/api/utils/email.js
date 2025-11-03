const nodemailer = require("nodemailer");

// Crear el transporte SMTP para Amazon SES
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT || 587,
  secure: false, // true si usas 465
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

/**
 * Envía un correo de pago usando Nodemailer (SMTP de SES)
 * @param {string} to - destinatario
 * @param {string} subject - asunto
 * @param {string} html - cuerpo en formato HTML
 */
async function sendPaymentEmail(to, subject, html) {
  try {
    const mailOptions = {
      from: `"LegitHomie Grupo 11" <${process.env.SENDER_EMAIL}>`,
      to,
      subject,
      html,
      text: html.replace(/<[^>]*>/g, ""),
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`🟢 Correo enviado a ${to} — ID: ${info.messageId}`);
    return info;
  } catch (err) {
    console.error(`[SMTP] Error enviando correo a ${to}:`, err.message);
  }
}

module.exports = { sendPaymentEmail };
