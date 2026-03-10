const FiveAliveEngine = require("../games/fiveAlive/engine");
const FiveAliveRoundManager = require("../games/fiveAlive/roundManager");

const games = new Map();

async function setFiveAliveGame(roomId, players) {
  const engine = new FiveAliveEngine(players, roomId);
  new FiveAliveRoundManager(engine);

  games.set(roomId, engine);
  return engine;
}

function startFiveAliveGame(engine) { 
    engine.startRound();
}

function getFiveAliveGame(roomId) {
  return games.get(roomId);
}

function endFiveAliveGame(roomId) {
  games.delete(roomId);
}

module.exports = { setFiveAliveGame, startFiveAliveGame, getFiveAliveGame, endFiveAliveGame };
