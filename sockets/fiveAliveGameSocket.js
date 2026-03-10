const { getFiveAliveGame } = require("../managers/fiveAliveGameManager");

function registerFiveAliveGameSockets(io, socket) {
  socket.on("join_room", ({ roomId }) => {
    socket.join(roomId);
  });

  socket.on("fivealive_play_card", data => {
    const { roomId, playerId, cardIndex } = data;
    const engine = getFiveAliveGame(roomId);
    if (!engine) return;

    engine.play(playerId, cardIndex);
  });
}

function bindFiveAliveEngineEvents(io, roomId, engine) {
  engine.on("fivealive_state", snapshot => {
    io.to(roomId).emit("fivealive_game_state", snapshot);
  });
}

module.exports = { registerFiveAliveGameSockets, bindFiveAliveEngineEvents };
