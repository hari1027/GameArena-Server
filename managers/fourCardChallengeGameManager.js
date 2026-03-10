const FourCardChallengeEngine = require("../games/fourCardChallenge/engine");
const FourCardChallengeManager = require("../games/fourCardChallenge/roundManager");

const games = new Map();

async function setFourCardChallengeGame(roomId, players) {
  const engine = new FourCardChallengeEngine(players, roomId);
  new FourCardChallengeManager(engine);

  games.set(roomId, engine);
  return engine;
}

function startFourCardChallengeGame(engine) {
  engine.startRound();
}

function getFourCardChallengeGame(roomId) {
  return games.get(roomId);
}

function endFourCardChallengeGame(roomId) {
  games.delete(roomId);
}

module.exports = {
  setFourCardChallengeGame,
  startFourCardChallengeGame,
  getFourCardChallengeGame,
  endFourCardChallengeGame,
};
