const Router = require("@koa/router");
const { sendPurchaseRequest } = require("../../broker/mqttClient");

const router = new Router();

// Endpoint para crear una solicitud de compra
router.post("create.purchase", "/", async (ctx) => {
  try {
    const { property_url } = ctx.request.body;
    
    if (!property_url) {
      ctx.body = { error: "property_url es requerido" };
      ctx.status = 400;
      return;
    }
    
    // 1. Verificar que la propiedad existe y tiene offers disponibles
    const property = await ctx.orm.Propertie.findOne({
      where: { url: property_url }
    });
    
    if (!property) {
      ctx.body = { error: "Propiedad no encontrada" };
      ctx.status = 404;
      return;
    }
    
    if (property.offers <= 0) {
      ctx.body = { 
        error: "No hay visitas disponibles para esta propiedad",
        available_offers: property.offers
      };
      ctx.status = 409; // Conflict
      return;
    }
    
    console.log(`Enviando solicitud de compra para: ${property.name} (${property.offers} offers disponibles)`);
     // 2. Intento 1 RNF10
    try {
      await sendPurchaseRequest(property_url);
    } catch (e1) {
      console.warn("Compra: intento 1 falló, reintentando 1 vez…", e1.message || e1);
      // 3. Reintento 2 (única vez) RNF10
      try {
        await sendPurchaseRequest(property_url);
      } catch (e2) {
        ctx.status = 502;
        ctx.body = { error: "Solicitud de compra fallida tras 1 reintento", details: e2.message || String(e2) };
        return;
      }
    }

    ctx.status = 201;
    ctx.body = {
      message: "Solicitud de compra enviada",
      property_url,
      property_name: property.name,
      available_offers: property.offers,
      status: "pending", // quedamos a la espera de VALIDATION
    };
  } catch (error) {
    console.error("Error en solicitud de compra:", error);
    ctx.status = 500;
    ctx.body = { error: "Error interno del servidor" };
  }
});

// [INTERNO] para reducir offers (llamado desde MQTT)
router.post("reduce.offers", "/reduce-offers", async (ctx) => {
  try {
    const { property_url, operation } = ctx.request.body;
    
    if (!property_url) {
      ctx.body = { error: "property_url es requerido" };
      ctx.status = 400;
      return;
    }
    
    const property = await ctx.orm.Propertie.findOne({
      where: { url: property_url }
    });
    
    if (!property) {
      ctx.body = { error: "Propiedad no encontrada" };
      ctx.status = 404;
      return;
    }
    
    if (operation === "REDUCE" && property.offers > 0) {
      // Reducir offers (cuando alguien agenda)
      property.offers -= 1;
      await property.save();
      
      console.log(`Offers reducidas a ${property.offers} para: ${property.name}`);
      ctx.body = { 
        message: "Offer reducida",
        remaining_offers: property.offers
      };
      
    } 
    
    ctx.status = 200;
    
  } catch (error) {
    console.error("Error gestionando offers:", error);
    ctx.body = { error: "Error interno del servidor" };
    ctx.status = 500;
  }
});

module.exports = router;