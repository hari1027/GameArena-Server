class RoundManager {
  constructor(engine) {
    this.engine = engine;

    // Listen for roundEnd events
    this.engine.on("fivealive_roundEnd", (winnerId) => this.handleRoundEnd(winnerId));
  }

  handleRoundEnd(winnerId) {
    const winner = this.engine.players.find((p) => p.id === winnerId);

    // Lose life for others in the round
    this.engine.players.forEach((p) => {
      if (p.id !== winner.id && p.lives > 0) {
        this.engine.loseLife(p, false); // do not remove from activePlayers
      }
    });

    if (this.engine.checkMatchWinner()) {
      // Game completed → delete room
      setTimeout(() => {this.engine.handleGameCompletion()},4000);
      return;
    } else {
      // Set round ended message
      if (!this.engine.gameOver) {
        this.engine.setMessage(`Round ended, winner: ${winner.id}`);
        this.engine.broadcastState();

        // Start a new round after short delay
        setTimeout(() => {
          this.engine.startRound();
          this.engine.setMessage("New round started");
          this.engine.broadcastState();
        }, 1500);
      }
    }
  }
}

module.exports = RoundManager;
