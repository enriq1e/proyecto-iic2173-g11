const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const PDFDocument = require("pdfkit");

const s3 = new S3Client({ region: "us-east-2" });
const BUCKET_NAME = process.env.S3_BUCKET_NAME || "grupo11-boletas";

exports.generarBoleta = async (event) => {
  try {
    const body = JSON.parse(event.body || "{}");
    const user = body.user || {};
    const purchase = body.purchase || {};

    if (!user.email) {
      throw new Error("Falta email del usuario en el payload");
    }

    const timestamp = Date.now();
    const filename = `boletas/${user.email}-${timestamp}.pdf`;

    // Crear el PDF en memoria
    const doc = new PDFDocument();
    const chunks = [];

    return await new Promise((resolve, reject) => {
      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", async () => {
        try {
          const pdfBuffer = Buffer.concat(chunks);

          await s3.send(
            new PutObjectCommand({
              Bucket: BUCKET_NAME,
              Key: filename,
              Body: pdfBuffer,
              ContentType: "application/pdf",
            })
          );

          const fileUrl = `https://${BUCKET_NAME}.s3.amazonaws.com/${filename}`;
          console.log("✅ Boleta generada correctamente:", fileUrl);

          resolve({
            statusCode: 200,
            body: JSON.stringify({
              message: "Boleta generada correctamente",
              url: fileUrl,
            }),
          });
        } catch (err) {
          console.error("❌ Error subiendo a S3:", err);
          reject({
            statusCode: 500,
            body: JSON.stringify({
              error: "Error subiendo archivo a S3",
              details: err.message,
            }),
          });
        }
      });

      // Contenido del PDF
      doc.fontSize(22).text("Boleta Grupo 11", { align: "center" });
      doc.moveDown();
      doc.fontSize(14).text(`Cliente: ${user.email}`);
      doc.text(`Propiedad: ${purchase.propertyName || "No especificada"}`);
      doc.text(`URL: ${purchase.propertyUrl || "-"}`);
      doc.text(`Monto: ${purchase.amount || "N/A"} ${purchase.currency || ""}`);
      doc.text(`Estado: ${purchase.status || "N/A"}`);
      doc.text(`Fecha: ${new Date().toLocaleString("es-CL")}`);
      doc.end();
    });
  } catch (err) {
    console.error("❌ Error generando PDF:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Error generando boleta",
        details: err.message,
      }),
    };
  }
};
