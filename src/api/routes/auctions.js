const Router = require("@koa/router");
const authenticate = require("../middlewares/authenticate");
const { isAdmin } = require("../middlewares/roles");
const {
  sendAuctionOffer,
  sendAuctionProposal,
  sendAuctionResolution,
} = require("../../broker/mqttClient"); // ajusta la ruta según dónde está tu mqttClient


const router = new Router();
const TOPIC_AUCTIONS = process.env.TOPIC_AUCTIONS || "properties/auctions";


//RNF04---

// GET /auctions/offers
// Offers de subastas publicadas por OTROS grupos
router.get("/offers", authenticate, isAdmin, async (ctx) => {
  const myGroupId = String(process.env.GROUP_ID || "0");

  const events = await ctx.orm.EventLog.findAll({
    where: {
      topic: TOPIC_AUCTIONS,
      event_type: "AUCTION",
      operation: "offer",
      status: "PENDING",
    },
    order: [["timestamp", "DESC"]],
  });

  // Nos quedamos solo con offers de otros grupos
  const externalOffers = events.filter(
    (e) => String(e.group_id) !== myGroupId
  );
  // Buscar propiedades que coincidan con las URLs de las offers
  const urls = Array.from(new Set(externalOffers.map((e) => e.url).filter(Boolean)));
  let propertiesByUrl = {};
  if (urls.length > 0) {
    const props = await ctx.orm.Propertie.findAll({ where: { url: urls } });
    propertiesByUrl = props.reduce((acc, p) => {
      acc[p.url] = p;
      return acc;
    }, {});
  }

  // Devolvemos los eventos junto a la primera propiedad coincidente (si existe)
  // y deduplicamos por `property.id` para evitar repetidos.
  const uniq = new Map();
  for (const ev of externalOffers) {
    const prop = propertiesByUrl[ev.url] || null;
    if (prop && prop.id) {
      const key = String(prop.id);
      if (!uniq.has(key)) {
        uniq.set(key, { event: ev, property: prop });
      }
    } else {
      // fallback: si no encontramos propiedad, deduplicar por URL
      const key = ev.url || `__no_url__:${ev.id}`;
      if (!uniq.has(key)) {
        uniq.set(key, { event: ev, property: prop });
      }
    }
  }

  const result = Array.from(uniq.values());
  ctx.body = result;
});

// GET /auctions/proposals
// Proposals que OTROS grupos han hecho hacia nuestras offers
router.get("/proposals", authenticate, isAdmin, async (ctx) => {
  const myGroupId = String(process.env.GROUP_ID || "0");

  // Nuestras offers 
  const myOffers = await ctx.orm.EventLog.findAll({
    where: {
      topic: TOPIC_AUCTIONS,
      event_type: "AUCTION",
      operation: "offer",
      group_id: myGroupId,
    },
    order: [["timestamp", "DESC"]],
  });

  // Conjunto de auction_id de nuestras offers
  const myAuctionIds = new Set(
    myOffers
      .map((offer) => offer.raw?.auction_id)
      .filter((id) => !!id)
  );

  // Todas las proposals
  const allProposals = await ctx.orm.EventLog.findAll({
    where: {
      topic: TOPIC_AUCTIONS,
      event_type: "AUCTION",
      operation: "proposal",
      status: { [ctx.orm.Sequelize.Op.ne]: 'REJECTED' },
    },
    order: [["timestamp", "DESC"]],
  });

  // Solo proposals que responden a nuestras offers
  const proposalsToUs = allProposals.filter((p) => {
    const auctionId = p.raw?.auction_id;
    return auctionId && myAuctionIds.has(auctionId);
  });

  ctx.body = proposalsToUs;
});

// GET /auctions/proposals-url?property_url=<url>
// Busca todas las proposals cuyo campo `url` coincida exactamente con el parámetro
router.get("/proposals-url", authenticate, isAdmin, async (ctx) => {
  try {
    const rawUrl = ctx.query.property_url;
    if (!rawUrl) {
      ctx.status = 400;
      ctx.body = { error: 'property_url query param is required' };
      return;
    }

    const propertyUrl = decodeURIComponent(rawUrl);
    // Obtener todas las propiedades que coincidan (normalmente será una),
    // y usar la primera como referencia para los campos `url`/`img`.
    const properties = await ctx.orm.Propertie.findAll({ where: { url: propertyUrl } });
    const property = properties && properties.length > 0 ? properties[0] : null;

      // Construir cláusula WHERE para buscar por propertyUrl y, si existe,
      // también por property.img -> (url = propertyUrl OR url = property.img)
      const whereClause = {
        topic: TOPIC_AUCTIONS,
        event_type: 'AUCTION',
        operation: 'proposal',
        status: { [ctx.orm.Sequelize.Op.ne]: 'REJECTED' },
      };

      if (property && property.img) {
        // buscar por url igual a propertyUrl OR igual a property.img
        whereClause[ctx.orm.Sequelize.Op.or] = [
          { url: propertyUrl },
          { url: property.img },
        ];
      } else {
        whereClause.url = propertyUrl;
      }

      const proposals = await ctx.orm.EventLog.findAll({
        where: whereClause,
        order: [["timestamp", "DESC"]],
      });
    // Al devolver, ajustamos el field `url` del event para que use la URL de la
    // `property` (si existe) o, si no hay URL, usamos `property.img` cuando aplique.
    const result = proposals.map((p) => {
      const ev = p.toJSON ? p.toJSON() : Object.assign({}, p);
      if (property) {
        // preferir property.url, si no existe intentar property.img
        ev.url = property.url || property.img || ev.url;
      }
      return { event: ev, property: property || null };
    });

    ctx.body = result;
  } catch (err) {
    console.error('Error fetching proposalsx:', err.message);
    ctx.status = 500;
    ctx.body = { error: 'Internal server error' };
  }
});



//RNF05---

// POST /auctions/offers
// El admin publica una oferta de visitas para subastar a otros grupos
router.post("/offers", authenticate, isAdmin, async (ctx) => {
  const { url, quantity } = ctx.request.body || {};

  if (!url || !quantity) {
    ctx.status = 400;
    ctx.body = { error: "url y quantity son requeridos" };
    return;
  }

  try {
    const message = await sendAuctionOffer({ url, quantity });

    ctx.status = 201;
    ctx.body = {
      message: "Offer enviada al broker",
      auction_id: message.auction_id,
      payload: message,
    };
  } catch (err) {
    ctx.status = 502;
    ctx.body = { error: "Error enviando offer a auctions", details: err.message };
  }
});

// POST /auctions/proposals
// El admin responde a la oferta de otro grupo con una proposal
// body: { auction_id, url, quantity }
router.post("/proposals", authenticate, isAdmin, async (ctx) => {
  const { auction_id, url, quantity } = ctx.request.body || {};

  if (!auction_id || !url || !quantity) {
    ctx.status = 400;
    ctx.body = { error: "auction_id, url y quantity son requeridos" };
    return;
  }

  try {
    
    const message = await sendAuctionProposal({ auction_id, url, quantity });

    ctx.status = 201;
    ctx.body = {
      message: "Proposal enviada al broker",
      auction_id: message.auction_id,
      proposal_id: message.proposal_id,
      payload: message,
    };
  } catch (err) {
    ctx.status = 502;
    ctx.body = { error: "Error enviando proposal a auctions", details: err.message };
  }
});


// POST /auctions/proposals/:id/accept
// El admin acepta una proposal hacia una oferta nuestra
router.post("/proposals/:id/accept", authenticate, isAdmin, async (ctx) => {
  const { id } = ctx.params;

  const proposalEvent = await ctx.orm.EventLog.findByPk(id);
  if (!proposalEvent || proposalEvent.operation !== "proposal") {
    ctx.status = 404;
    ctx.body = { error: "Proposal no encontrada" };
    return;
  }

  try {
    const message = await sendAuctionResolution({
      proposalEvent,
      resolution: "acceptance",
    });

    // --- Actualizar estados en DB: marcar la proposal aceptada y rechazar las demás
    try {
      // extraer auction_id y proposal_id desde proposalEvent.raw (tolerante a string/obj)
      let auctionId = null;
      let proposalId = null;
      const raw = proposalEvent.raw;
      if (raw) {
        if (typeof raw === 'string') {
          try {
            const parsed = JSON.parse(raw);
            auctionId = parsed?.auction_id || null;
            proposalId = parsed?.proposal_id || null;
          } catch (e) {
            // ignore parse error
          }
        } else if (typeof raw === 'object') {
          auctionId = raw.auction_id || null;
          proposalId = raw.proposal_id || null;
        }
      }

      if (auctionId && proposalId) {
        const proposals = await ctx.orm.EventLog.findAll({
          where: {
            event_type: 'AUCTION',
            operation: 'proposal',
            raw: {auction_id: auctionId}
          },
        });

        for (const ev of proposals) {
          if (!ev.raw) continue;

          let evAuctionId = null;
          let evProposalId = null;
          if (typeof ev.raw === 'string') {
            try {
              const parsed = JSON.parse(ev.raw);
              evAuctionId = parsed?.auction_id || null;
              evProposalId = parsed?.proposal_id || null;
            } catch (e) {
              continue;
            }
          } else if (typeof ev.raw === 'object') {
            evAuctionId = ev.raw.auction_id || null;
            evProposalId = ev.raw.proposal_id || null;
          }

          if (!evAuctionId || evAuctionId !== auctionId) continue;

          if (String(evProposalId) === String(proposalId)) {
            if (ev.status !== 'ACCEPTED') {
              ev.status = 'ACCEPTED';
              await ev.save();
            }
          } else if (!ev.status || ev.status === 'PENDING') {
            ev.status = 'REJECTED';
            await ev.save();
          }
        }
      }
    } catch (e) {
      console.error('[AUCTIONS] Error actualizando estados tras accept:', e);
    }

    // TODO (opcional): aquí podrías actualizar tus reservas internas
    // sumando/restando quantity según la regla del enunciado.
    
    ctx.status = 200;
    ctx.body = {
      message: "Proposal aceptada y enviada al broker",
      payload: message,
    };
  } catch (err) {
    ctx.status = 502;
    ctx.body = {
      error: "Error enviando acceptance a auctions",
      details: err.message,
    };
  }
});

// POST /auctions/proposals/:id/reject
// El admin rechaza una proposal hacia una oferta nuestra
router.post("/proposals/:id/reject", authenticate, isAdmin, async (ctx) => {
  const { id } = ctx.params;

  const proposalEvent = await ctx.orm.EventLog.findByPk(id);
  if (!proposalEvent || proposalEvent.operation !== "proposal") {
    ctx.status = 404;
    ctx.body = { error: "Proposal no encontrada" };
    return;
  }

  try {
    const message = await sendAuctionResolution({
      proposalEvent,
      resolution: "rejection",
    });

    // Marcar esta proposal como REJECTED en la DB
    try {
      if (proposalEvent.status !== 'REJECTED') {
        proposalEvent.status = 'REJECTED';
        await proposalEvent.save();
      }
    } catch (e) {
      console.error('[AUCTIONS] Error marcando proposal como REJECTED en /reject:', e);
    }

    ctx.status = 200;
    ctx.body = {
      message: "Proposal rechazada y enviada al broker",
      payload: message,
    };
  } catch (err) {
    ctx.status = 502;
    ctx.body = {
      error: "Error enviando rejection a auctions",
      details: err.message,
    };
  }
});

module.exports = router;
