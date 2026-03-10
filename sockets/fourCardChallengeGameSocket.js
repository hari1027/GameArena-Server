const {
  getFourCardChallengeGame,
} = require("../managers/fourCardChallengeGameManager");

function registerFourCardChallengeGameSockets(io, socket) {
  socket.on("join_room", ({ roomId }) => {
    socket.join(roomId);
  });

  socket.on("fcc_play", (data) => {
    const { roomId, playerId, card, drawChoice } = data;

    const engine = getFourCardChallengeGame(roomId);
    if (!engine) return;

    engine.playCards(playerId, card, drawChoice);
  });

  socket.on("fcc_challenge", (data) => {
    const { roomId, playerId } = data;

    const engine = getFourCardChallengeGame(roomId);
    if (!engine) return;

    engine.challenge(playerId);
  });
}

function bindFourCardChallengeEngineEvents(io, roomId, engine) {
  engine.on("fcc_state", (snapshot) => {
    io.to(roomId).emit("fcc_game_state", snapshot);
  });
}

module.exports = {
  registerFourCardChallengeGameSockets,
  bindFourCardChallengeEngineEvents,
};
