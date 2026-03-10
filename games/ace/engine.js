const EventEmitter = require("events");
const { buildDeck } = require("./deck");
const Player = require("./player");

const RANK_ORDER = [
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
  "A",
];

const rankValue = (rank) => RANK_ORDER.indexOf(rank);

class AceGameEngine extends EventEmitter {
  constructor(playerIds, roomId) {
    super();

    this.roomId = roomId;
    this.players = playerIds.map((id) => new Player(id));
    this.activePlayers = [];
    this.deck = [];
    this.discard = [];
    this.turn = 0;
    this.roundSuit = null;
    this.roundCards = [];
    this.gameOver = false;
    this.lastMessage = "Game started";
    this.botThinking = false;
  }

  /* ---------------- MESSAGE ---------------- */

  setMessage(msg) {
    this.lastMessage = msg;
  }

  dealCardsCircular() {
    const totalPlayers = this.activePlayers.length;
    if (totalPlayers === 0) return;
    // pick random starter
    const starterIndex = Math.floor(Math.random() * totalPlayers);
    let currentIndex = starterIndex;
    while (this.deck.length > 0) {
      const player = this.activePlayers[currentIndex];
      player.hand.push(this.deck.pop());
      currentIndex = (currentIndex + 1) % totalPlayers;
    }
  }

  /* ---------------- START GAME ---------------- */

  startGame() {
    this.deck = buildDeck();
    this.discard = [];
    this.roundCards = [];
    this.roundSuit = null;
    this.gameOver = false;
    // all players active
    this.activePlayers = [...this.players];
    // clear hands
    this.players.forEach((p) => (p.hand = []));
    this.dealCardsCircular();
    this.botThinking = false;

    // find A♠ starter
    let starterIndex = this.activePlayers.findIndex((player) =>
      player.hand.some((card) => card.rank === "A" && card.suit === "spade"),
    );
    if (starterIndex === -1) starterIndex = 0;
    this.turn = starterIndex;
    this.setMessage(
      `${this.activePlayers[this.turn].id} has A Spade and he will start the game`,
    );
    this.broadcastState();
  }

  /* ---------------- PLAY ---------------- */

  play(playerId, cardIndex) {
    this.botThinking = false;
    if (this.gameOver) return;
    const player = this.activePlayers[this.turn];
    if (!player || player.id !== playerId) return;
    const card = player.hand[cardIndex];
    if (!card) return;

    // enforce follow suit rule
    if (this.roundSuit !== null) {
      const hasSuit = player.hand.some((c) => c.suit === this.roundSuit);

      if (hasSuit && card.suit !== this.roundSuit) {
        this.setMessage(`${playerId} must follow suit`);
        this.broadcastState();
        return;
      }
    }

    // remove card
    player.hand.splice(cardIndex, 1);

    // set round suit
    if (this.roundCards.length === 0) {
      this.roundSuit = card.suit;
    }

    this.roundCards.push({
      playerId,
      card,
    });

    this.setMessage(`${playerId} played ${card.rank} of ${card.suit}`);

    // check round completion
    if (this.isRoundComplete()) {
      setTimeout(() => this.handleRoundEnd(), 2000);
      return;
    }

    this.nextTurn();
    this.broadcastState();
  }

  /* ---------------- ROUND COMPLETE ---------------- */

  isRoundComplete() {
    // CUT happened
    const cut = this.roundCards.some((r) => r.card.suit !== this.roundSuit);
    if (cut) return true;
    // all players played
    if (this.roundCards.length === this.activePlayers.length) return true;
    return false;
  }

  /* ---------------- HANDLE ROUND END ---------------- */

  handleRoundEnd() {
    const highestRankId = this.getRoundHighestOfSuit();
    const highestRankPerson = this.activePlayers.find(
      (p) => p.id === highestRankId,
    );

    // const winnerIndex = this.activePlayers.findIndex((p) => p.id === highestRankId);

    const cutHappened = this.roundCards.some(
      (r) => r.card.suit !== this.roundSuit,
    );

    const cards = this.roundCards.map((r) => r.card);

    if (cutHappened) {
      // penalty → give cards
      highestRankPerson.hand.push(...cards);
      this.setMessage(
        `${highestRankId} got CUT and received ${cards.length} cards`,
      );
    } else {
      // safe → discard
      this.discard.push(...cards);
      this.setMessage(`Round Ended Safely without any Cuts`);
    }

    // reset round
    this.roundCards = [];
    this.roundSuit = null;

    // remove players with zero cards (SAFE players)
    this.activePlayers = this.activePlayers.filter(
      (player) => player.hand.length > 0,
    );

    // donkey detection
    if (this.activePlayers.length === 1) {
      const donkey = this.activePlayers[0];
      this.setMessage(`Game Over. Donkey is ${donkey.id}`);
      this.gameOver = true;
      this.broadcastState();
      setTimeout(() => this.deleteRoom(), 4000);
      return;
    }

    // highest rank starts next round
    const newIndex = this.activePlayers.findIndex(
      (p) => p.id === highestRankId,
    );
    this.turn = newIndex !== -1 ? newIndex : 0;
    this.broadcastState();
  }

  /* ---------------- FIND HIGHEST ---------------- */

  getRoundHighestOfSuit() {
    let highest = null;

    this.roundCards.forEach((entry) => {
      if (entry.card.suit !== this.roundSuit) return;
      if (!highest) highest = entry;
      else {
        const currentRank = RANK_ORDER.indexOf(entry.card.rank);
        const highestRank = RANK_ORDER.indexOf(highest.card.rank);
        if (currentRank > highestRank) highest = entry;
      }
    });

    return highest.playerId;
  }

  /* ---------------- NEXT TURN ---------------- */

  nextTurn() {
    if (this.gameOver) return;
    if (!this.activePlayers.length) return;
    this.turn = (this.turn + 1) % this.activePlayers.length;
  }

  /* ---------------- SNAPSHOT ---------------- */

  snapshot() {
    return {
      players: this.players.map((p) => ({
        username: p.id,
        cardsCount: p.hand.length,
      })),
      cardsList: this.players.map((p) => ({
        username: p.id,
        cards: [...p.hand],
      })),
      currentTurn: this.activePlayers[this.turn]?.id,
      roundSuit: this.roundSuit,
      roundCards: [...this.roundCards],
      message: this.lastMessage,
    };
  }

  /* ---------------- BROADCAST ---------------- */

  broadcastState() {
    this.emit("ace_state", this.snapshot());
    if(this.activePlayers[this.turn]?.isBot){
       this.playBotTurn();
    }
  }

  /* ---------------- DELETE ROOM ---------------- */

  deleteRoom() {
    fetch(`http://localhost:3000/gameCompleted/${this.roomId}`, {
      method: "POST",
    })
      .then(() => console.log("Room deleted"))
      .catch((err) => console.error("Delete failed", err));
  }

  replacePlayerWithBot(oldUsername, botName) {
    const player = this.players.find((p) => p.id === oldUsername);
    if (!player) return;

    player.id = botName;
    player.isBot = true;

    this.setMessage(`${oldUsername} was replaced by BOT ${botName}`);
    this.broadcastState();
  }

  playBotTurn() {
    if (this.gameOver) return;
    const player = this.activePlayers[this.turn];
    if (!player || !player.isBot) return;
    if (this.botThinking) return;
    this.botThinking = true;
    const cardIndex = this.chooseBotCard(player);
    setTimeout(() => {this.play(player.id, cardIndex)},8000);
    this.botThinking = false;
  }

  chooseBotCard(player) {
    const hand = player.hand;
    const positionInRound = this.roundCards.length; // 0 = opener
    const totalPlayers = this.activePlayers.length;
    const isOpener = positionInRound === 0;
    const isLast = positionInRound === totalPlayers - 1;

    const valueOf = (card) => rankValue(card.rank);
    const indexOf = (card) => hand.indexOf(card);

    // Highest round-suit rank already ON the table
    const tableHighValue = () => {
      const suitPlayed = this.roundCards.filter(
        (r) => r.card.suit === this.roundSuit,
      );
      if (!suitPlayed.length) return -1;
      return Math.max(...suitPlayed.map((r) => valueOf(r.card)));
    };

    const suitCards = hand.filter((c) => c.suit === this.roundSuit);
    const hasSuit = suitCards.length > 0;

    /* ══════════════════════════════════════════════════════════════
     CASE A — OPENER
  ══════════════════════════════════════════════════════════════ */
    if (isOpener) {
      // Mid-range (4–9, rank index 2–7), low first
      const mid = hand
        .filter((c) => valueOf(c) >= 2 && valueOf(c) <= 7)
        .sort((a, b) => valueOf(a) - valueOf(b));
      if (mid.length > 0) return indexOf(mid[0]);

      // Fallback: second-lowest (keep the absolute lowest as buffer)
      const sorted = [...hand].sort((a, b) => valueOf(a) - valueOf(b));
      return indexOf(sorted.length >= 2 ? sorted[1] : sorted[0]);
    }

    /* ══════════════════════════════════════════════════════════════
     CASE B — FOLLOWING with round suit available
  ══════════════════════════════════════════════════════════════ */
    if (hasSuit) {
      const tableHigh = tableHighValue();

      // "Safe" cards: their rank is BELOW the current table high.
      // Even if we play and "win" this sub-round, someone on the table
      // already holds a higher card → cut penalty goes to THEM, not us.
      const safeCards = suitCards
        .filter((c) => valueOf(c) < tableHigh)
        .sort((a, b) => valueOf(b) - valueOf(a)); // highest safe first

      // "Dangerous" cards: we ARE the highest if we play these.
      // If a cut happens after us, WE collect all cards.
      const dangerCards = suitCards
        .filter((c) => valueOf(c) >= tableHigh)
        .sort((a, b) => valueOf(a) - valueOf(b)); // lowest dangerous first

      /* Last / second-last — round almost over, lower cut risk */
      if (isLast) {
        // Play the highest safe card to shed it (it won't cause penalty)
        if (safeCards.length > 0) return indexOf(safeCards[0]);
        // No safe card → play lowest dangerous card (minimise exposure)
        return indexOf(dangerCards[0]);
      }

      /* Middle of round — still players to come, cut risk is real */
      // Strongly prefer safe cards — play highest safe to dump it
      if (safeCards.length > 0) return indexOf(safeCards[0]);

      // Forced to play a dangerous card — play the lowest one
      // (keeps our bigger dangerous cards for safer moments)
      return indexOf(dangerCards[0]);
    }

    /* ══════════════════════════════════════════════════════════════
     CASE C — NO round suit: must cut
     Dump our highest card — it's going to the highest-suit holder
     anyway, so shed your most dangerous card for free.
  ══════════════════════════════════════════════════════════════ */
    const nonSuit = hand.filter((c) => c.suit !== this.roundSuit);
    const sorted = [...nonSuit].sort((a, b) => valueOf(b) - valueOf(a));
    return indexOf(sorted[0]);
  }
}

module.exports = AceGameEngine;
