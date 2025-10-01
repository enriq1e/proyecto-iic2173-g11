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
    sendPurchaseRequest(property_url);
    
    ctx.body = { 
      message: "Solicitud de compra enviada",
      property_url: property_url,
      property_name: property.name,
      available_offers: property.offers,
      status: "pending"
    };
    ctx.status = 201;
    
  } catch (error) {
    console.error("Error en solicitud de compra:", error);
    ctx.body = { error: "Error interno del servidor" };
    ctx.status = 500;
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