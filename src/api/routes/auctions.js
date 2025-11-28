const Router = require("@koa/router");
const authenticate = require("../middlewares/authenticate");
const { isAdmin } = require("../middlewares/roles");

const router = new Router();
const TOPIC_AUCTIONS = process.env.TOPIC_AUCTIONS || "properties/auctions";

// GET /auctions/offers
// Offers de subastas publicadas por OTROS grupos
router.get("/offers", authenticate, isAdmin, async (ctx) => {
  const myGroupId = String(process.env.GROUP_ID || "0");

  const events = await ctx.orm.EventLog.findAll({
    where: {
      topic: TOPIC_AUCTIONS,
      event_type: "AUCTION",
      operation: "offer",
    },
    order: [["timestamp", "DESC"]],
  });

  // Nos quedamos solo con offers de otros grupos
  const externalOffers = events.filter(
    (e) => String(e.group_id) !== myGroupId
  );

  ctx.body = externalOffers;
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

// // Este reocge todas las propuestas hechas a cualquier grupo
// // router.get("/proposals", authenticate, isAdmin, async (ctx) => {
// //   const myGroupId = Number(process.env.GROUP_ID || 0);

// //   const events = await ctx.orm.EventLog.findAll({
// //     where: {
// //       topic: process.env.TOPIC_AUCTIONS || "properties/auctions",
// //       event_type: "AUCTION",
// //       operation: "proposal",
// //     },
// //     order: [["timestamp", "DESC"]],
// //   });

// //   // Opcional: filtrar solo propuestas relacionadas con nuestras ofertas.
// //   ctx.body = events;
// // });

module.exports = router;
