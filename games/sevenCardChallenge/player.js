class Player {
  constructor(id) {
    this.id = id;
    this.hand = [];
    this.roundPoints = 0;
    this.totalPoints = 0;
    this.isBot = false;
  }
}

module.exports = Player;
