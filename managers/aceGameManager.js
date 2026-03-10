const AceEngine = require("../games/ace/engine");
const AceRoundManager = require("../games/ace/roundManager");

const games = new Map();

async function setAceGame(roomId, players) {
  const engine = new AceEngine(players, roomId);
  new AceRoundManager(engine);

  games.set(roomId, engine);
  return engine;
}

function startAceGame(engine) { 
    engine.startGame();
}

function getAceGame(roomId) {
  return games.get(roomId);
}

function endAceGame(roomId) {
  games.delete(roomId);
}

module.exports = { setAceGame, startAceGame, getAceGame, endAceGame };
