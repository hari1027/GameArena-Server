const {
  getSevenCardChallengeGame,
} = require("../managers/sevenCardChallengeGameManager");

function registerSevenCardChallengeGameSockets(io, socket) {
  socket.on("join_room", ({ roomId }) => {
    socket.join(roomId);
  });

  socket.on("scc_play", (data) => {
    const { roomId, playerId, cards, drawChoice, selectedDiscardCard } = data;

    const engine = getSevenCardChallengeGame(roomId);
    if (!engine) return;

    engine.playCards(playerId, cards, drawChoice, selectedDiscardCard );
  });

  socket.on("scc_challenge", (data) => {
    const { roomId, playerId } = data;

    const engine = getSevenCardChallengeGame(roomId);
    if (!engine) return;

    engine.challenge(playerId);
  });
}

function bindSevenCardChallengeEngineEvents(io, roomId, engine) {
  engine.on("scc_state", (snapshot) => {
    io.to(roomId).emit("scc_game_state", snapshot);
  });
}

module.exports = {
  registerSevenCardChallengeGameSockets,
  bindSevenCardChallengeEngineEvents,
};
