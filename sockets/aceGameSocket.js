const { getAceGame } = require("../managers/aceGameManager");

function registerAceGameSockets(io, socket) {
  socket.on("join_room", ({ roomId }) => {
    socket.join(roomId);
  });

  socket.on("ace_play_card", data => {
    const { roomId, playerId, cardIndex } = data;
    const engine = getAceGame(roomId);
    if (!engine) return;

    engine.play(playerId, cardIndex);
  });
}

function bindAceEngineEvents(io, roomId, engine) {
  engine.on("ace_state", snapshot => {
    io.to(roomId).emit("ace_game_state", snapshot);
  });
}

module.exports = { registerAceGameSockets, bindAceEngineEvents };
