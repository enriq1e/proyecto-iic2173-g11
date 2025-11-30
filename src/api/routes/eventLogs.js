const Router = require('@koa/router');
const router = new Router();

const TOPIC_AUCTIONS = process.env.TOPIC_AUCTIONS || "properties/auctions";
const MY_GROUP_ID = String(process.env.GROUP_ID || "");

// cuando hay un acceptance en subastas/intercambios,
// debemos actualizar nuestra cantidad de agendamientos reservados.
//
// Regla:
// - auction_id identifica la oferta original.
// - proposal_id identifica la propuesta aceptada.
// - offerEvent.raw.url / .quantity  → propiedad y visitas originalmente ofrecidas.
// - proposalEvent.raw.url / .quantity → propiedad y visitas ofrecidas en la propuesta.
//
// Para nuestro grupo (MY_GROUP_ID):
// - Si somos el grupo de la offer, ganamos las visitas de la proposal y perdemos las de la offer.
// - Si somos el grupo de la proposal, ganamos las visitas de la offer y perdemos las de la proposal.
// Además, si nosotros habíamos mandado varias proposals para el mismo auction_id,
// todas las demás pasan automáticamente a estado "REJECTED".
async function applyAuctionAcceptance(ctx, acceptanceEvent) {
  const EventLog = ctx.orm.EventLog;
  const Propertie = ctx.orm.Propertie;

  const raw = acceptanceEvent.raw || {};
  const auctionId = raw.auction_id;
  const proposalId = raw.proposal_id;

  console.log("[AUCTIONS] applyAuctionAcceptance called", {
    auctionId,
    proposalId,
    myGroupId: MY_GROUP_ID,
  });

  if (!auctionId || !proposalId) {
    console.warn("[AUCTIONS] acceptance sin auction_id o proposal_id, se ignora");
    return;
  }

  // 1. Buscar la proposal aceptada
  const allProposals = await EventLog.findAll({
    where: {
      topic: TOPIC_AUCTIONS,
      event_type: "AUCTION",
      operation: "proposal",
    },
  });

  const proposalEvent = allProposals.find(
    (ev) => ev.raw && ev.raw.auction_id === auctionId && ev.raw.proposal_id === proposalId
  );

  if (!proposalEvent) {
    console.warn(
      `[AUCTIONS] No se encontró proposal para auction_id=${auctionId} / proposal_id=${proposalId}`
    );
    return;
  }

  // 2. Buscar la offer original de ese auction_id
  const allOffers = await EventLog.findAll({
    where: {
      topic: TOPIC_AUCTIONS,
      event_type: "AUCTION",
      operation: "offer",
    },
  });

  const offerEvent = allOffers.find(
    (ev) => ev.raw && ev.raw.auction_id === auctionId
  );

  if (!offerEvent) {
    console.warn(
      `[AUCTIONS] No se encontró offer para auction_id=${auctionId}`
    );
    return;
  }

  const offerGroup = String(offerEvent.group_id || "");
  const proposalGroup = String(proposalEvent.group_id || "");
  const myGroupId = MY_GROUP_ID;

  console.log("[AUCTIONS] groups", { offerGroup, proposalGroup, myGroupId });

  if (!myGroupId) {
    console.warn("[AUCTIONS] MY_GROUP_ID no definido, no se aplica RF06");
    return;
  }

  // Si nuestro grupo no participa en esta subasta, no hacemos nada.
  if (myGroupId !== offerGroup && myGroupId !== proposalGroup) {
    console.log("[AUCTIONS] Nuestro grupo no participa en este intercambio, no se actualiza nada");
    return;
  }

  const offerquantity = Number(offerEvent.raw?.quantity || 0);
  const proposalquantity = Number(proposalEvent.raw?.quantity || 0);

  const cleanUrl = (url) =>
    (url || "").split("#")[0].split("?")[0].trim();

  const offerUrl = cleanUrl(offerEvent.raw?.url || offerEvent.url);
  const proposalUrl = cleanUrl(proposalEvent.raw?.url || proposalEvent.url);

  console.log("[AUCTIONS] URLs y cantidades", {
    offerUrl,
    proposalUrl,
    offerquantity,
    proposalquantity,
  });

    async function sumOffers(url, quantity) {
    if (!url || !quantity || quantity <= 0) return;
    let property = await Propertie.findOne({ where: { url } });

    if (!property) {
      console.warn(
        `[AUCTIONS] sumOffers: no se encontró propiedad con url=${url}, creando placeholder con valores por defecto`
      );
      property = await Propertie.create({
        name: "Propiedad intercambio",
        price: 0,
        currency: "$",
        // Campos que en tu BD son NOT NULL o muy probablemente lo sean:
        bedrooms: "0",
        bathrooms: "0",
        m2: "0",
        location: "Intercambio",
        img: "",
        url,
        is_project: false,
        timestamp: new Date(),
        offers: quantity,
      });
    } else {
      const current = Number(property.offers || 0);
      property.offers = current + quantity;
      await property.save();
    }
  }

  

  async function subtractOffers(url, quantity) {
    if (!url || !quantity || quantity <= 0) return;
    const property = await Propertie.findOne({ where: { url } });
    if (!property) {
      console.warn(`[AUCTIONS] subtractOffers: no se encontró propiedad con url=${url}`);
      return;
    }
    const current = Number(property.offers || 0);
    property.offers = Math.max(0, current - quantity);
    await property.save();
  }

  // 3. Actualizar nuestras reservas segun nuestro rol en el intercambio
  if (myGroupId === offerGroup) {
    // Somos el grupo que hizo la OFFER original
    // (1) Agregamos las visitas que ofrecia el otro grupo (proposal)
    await sumOffers(proposalUrl, proposalquantity);
    // (2) Descontamos las visitas que nosotros disponibilizamos en la offer
    await subtractOffers(offerUrl, offerquantity);
  } else if (myGroupId === proposalGroup) {
    // Somos el grupo que envio la PROPOSAL
    await sumOffers(offerUrl, offerquantity);
    await subtractOffers(proposalUrl, proposalquantity);
  }

  // Marcar todas las proposals del mismo auction_id: la seleccionada como ACCEPTED,
  // las demás que estén en PENDING o sin estado pasarán a REJECTED.
  // Hacemos esto de forma global en la base de datos para mantener consistencia
  // independientemente de si nuestro grupo fue el offer o el proposal.
  for (const ev of allProposals) {
    if (!ev.raw || ev.raw.auction_id !== auctionId) continue;

    if (ev.id === proposalEvent.id) {
      if (ev.status !== "ACCEPTED") {
        ev.status = "ACCEPTED";
        await ev.save();
      }
    } else if (!ev.status || ev.status === "PENDING") {
      ev.status = "REJECTED";
      await ev.save();
    }
  }

  console.log("[AUCTIONS] applyAuctionAcceptance terminado OK");
}


// POST /event-logs
router.post('/', async (ctx) => {
  try {
    const {
      topic, event_type, timestamp, url,
      request_id, group_id, origin, operation,
      status, reason, raw
    } = ctx.request.body;

    // creamos evento
    const row = await ctx.orm.EventLog.create({
      topic,
      event_type,
      timestamp: timestamp ? new Date(timestamp) : null,
      url: url || null,
      request_id: request_id || null,
      group_id: group_id || null,
      origin: (typeof origin === 'number') ? origin : null,
      operation: operation || null,
      status: status || null,
      reason: reason || null,
      raw
    });

    // si es un acceptance de AUCTION, aplicamos la logica de intercambio
    if (
      row.topic === TOPIC_AUCTIONS &&
      row.event_type === "AUCTION" &&
      row.operation === "acceptance"
    ) {
      try {
        await applyAuctionAcceptance(ctx, row);
      } catch (e) {
        console.error("[AUCTIONS] Error aplicando RF06 en acceptance:", e);
        // No rompemos el POST /event-logs por esto, solo lo dejamos logueado
      }
    }

    // si es un rejection de AUCTION, marcamos todas las proposals con el
    // mismo raw.proposal_id como REJECTED (tolerante a raw stringificado)
    if (
      row.topic === TOPIC_AUCTIONS &&
      row.event_type === "AUCTION" &&
      row.operation === "rejection"
    ) {
      try {
        // extraer proposal_id desde row.raw (puede ser objeto o string JSON)
        let rejectedProposalId = null;
        if (row.raw) {
          if (typeof row.raw === 'string') {
            try {
              const parsed = JSON.parse(row.raw);
              rejectedProposalId = parsed?.proposal_id || null;
            } catch (e) {
              // no JSON
              rejectedProposalId = null;
            }
          } else if (typeof row.raw === 'object') {
            rejectedProposalId = row.raw.proposal_id || null;
          }
        }

        if (rejectedProposalId) {
          const allProposals = await ctx.orm.EventLog.findAll({
            where: {
              topic: TOPIC_AUCTIONS,
              event_type: "AUCTION",
              operation: "proposal",
            },
          });

          for (const ev of allProposals) {
            if (!ev.raw) continue;

            let evProposalId = null;
            if (typeof ev.raw === 'string') {
              try {
                evProposalId = JSON.parse(ev.raw)?.proposal_id || null;
              } catch (e) {
                evProposalId = null;
              }
            } else if (typeof ev.raw === 'object') {
              evProposalId = ev.raw.proposal_id || null;
            }

            if (evProposalId && String(evProposalId) === String(rejectedProposalId)) {
              if (ev.status !== 'REJECTED') {
                ev.status = 'REJECTED';
                await ev.save();
              }
            }
          }
        }
      } catch (e) {
        console.error('[AUCTIONS] Error aplicando rejection:', e);
      }
    }

    ctx.status = 201;
    ctx.body = row;
  } catch (err) {
    console.error("Error en POST /event-logs:", err);
    ctx.status = 400;
    ctx.body = { error: 'cannot log event', details: err.message };
  }
});


// GET /event-logs/by-request/:request_id
router.get("/by-request/:request_id", async (ctx) => {
  try {
    const { request_id } = ctx.params;
    const event = await ctx.orm.EventLog.findOne({
      where: { request_id, event_type: "REQUEST" },
    });

    if (!event) {
      ctx.status = 404;
      ctx.body = { error: "EventLog no encontrado" };
      return;
    }

    ctx.body = event;
  } catch (error) {
    console.error("Error buscando EventLog:", error);
    ctx.status = 500;
    ctx.body = { error: "Error interno del servidor" };
  }
});

module.exports = router;
