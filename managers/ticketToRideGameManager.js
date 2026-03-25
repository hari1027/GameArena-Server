const TicketToRideEngine = require("../games/ticketToRide/engine");
const TicketToRideRoundManager = require("../games/ticketToRide/roundManager");

const games = new Map();

async function setTicketToRideGame(roomId, players) {
  const engine = new TicketToRideEngine(players, roomId);
  new TicketToRideRoundManager(engine);
  
  games.set(roomId, engine);
  return engine;
}

function startTicketToRideGame(engine) {
  engine.startGame();
}

function getTicketToRideGame(roomId) {
  return games.get(roomId);
}

function endTicketToRideGame(roomId) {
  games.delete(roomId);
}

module.exports = {
  setTicketToRideGame,
  startTicketToRideGame,
  getTicketToRideGame,
  endTicketToRideGame,
};
