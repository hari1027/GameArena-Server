class Player {
  constructor(id) {
    this.id = id;
    this.hand = [];
    this.lives = 5;
    this.active = true;
    this.isBot = false;
  }
}

module.exports = Player;
