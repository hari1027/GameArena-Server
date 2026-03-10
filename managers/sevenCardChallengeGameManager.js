const SevenCardChallengeEngine = require("../games/sevenCardChallenge/engine");
const SevenCardChallengeManager = require("../games/sevenCardChallenge/roundManager");

const games = new Map();

async function setSevenCardChallengeGame(roomId, players) {
  const engine = new SevenCardChallengeEngine(players, roomId);
  new SevenCardChallengeManager(engine);

  games.set(roomId, engine);
  return engine;
}

function startSevenCardChallengeGame(engine) {
  engine.startRound();
}

function getSevenCardChallengeGame(roomId) {
  return games.get(roomId);
}

function endSevenCardChallengeGame(roomId) {
  games.delete(roomId);
}

module.exports = {
  setSevenCardChallengeGame,
  startSevenCardChallengeGame,
  getSevenCardChallengeGame,
  endSevenCardChallengeGame,
};
