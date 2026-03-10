const EventEmitter = require("events");
const { buildDeck, shuffle } = require("./deck");
const Player = require("./player");

class FourCardChallengeEngine extends EventEmitter {
  constructor(playerIds, roomId) {
    super();

    this.roomId = roomId;
    this.players = playerIds.map((id) => new Player(id));

    this.round = 1;
    this.turn = 0;
    this.roundStarterIndex = 0;

    this.deck = [];
    this.discard = [];

    this.circleCount = 0;

    this.lastMessage = "Game started";
    this.gameOver = false;
    this.botThinking = false;
  }

  /* ---------- helpers ---------- */

  setMessage(msg) {
    this.lastMessage = msg;
  }

  rankValue(card) {
    if (card.joker) return 0;
    if (card.rank === "A") return 1;
    if (["J", "Q", "K"].includes(card.rank)) return 10;
    return Number(card.rank);
  }

  recycleDeckIfNeeded() {
    if (this.deck.length) return;

    if (this.discard.length <= 1) return;

    const top = this.discard.pop();
    this.deck = shuffle(this.discard);
    this.discard = [top];

    this.setMessage("Deck reshuffled from discard");
  }

  drawFromDeck(player) {
    this.recycleDeckIfNeeded();
    const card = this.deck.pop();
    if (card) {
      player.hand.push(card);
    }
  }

  // drawFromDiscard(player) {
  //   if (!this.discard.length) return;
  //   player.hand.push(this.discard.pop());
  // }

  nextTurn() {
    if (this.gameOver) return;
    this.turn = (this.turn + 1) % this.players.length;

    this.turnsThisRound++;

    if (this.turn === this.roundStarterIndex) {
      this.circleCount++;
    }
  }

  /* ---------- round start ---------- */

  startRound() {
    this.deck = buildDeck(this.players.length);
    this.discard = [];

    this.circleCount = 0;
    this.gameOver = false;

    this.players.forEach((p) => {
      p.hand = [];
      p.roundPoints = 0;

      for (let i = 0; i < 4; i++) {
        p.hand.push(this.deck.pop());
      }
    });

    this.discard.push(this.deck.pop());

    this.turn = this.roundStarterIndex;
    this.roundStarterIndex = (this.roundStarterIndex + 1) % this.players.length;
    this.botThinking = false;

    this.setMessage(`Round ${this.round} started`);
    this.broadcastState();
  }

  /* ---------- play ---------- */

  playCards(playerId, card, drawChoice = null) {
    this.botThinking = false;
    if (this.gameOver) return;
    const player = this.players[this.turn];
    if (!player || player.id !== playerId) return;
    if (!card) return;

    const rank = card.rank;

    // ✅ snapshot discard BEFORE play
    const previousTopDiscard = this.discard.at(-1);
    const match = previousTopDiscard && previousTopDiscard.rank === rank;
    const matchingCards = player.hand.filter((c) => c.rank === rank);
    const cardsToRemove = matchingCards.length > 0 ? matchingCards : [card];

    // ✅ draw logic — uses previous discard
    if (!match) {
      if (drawChoice === "discard" && previousTopDiscard) {
        this.discard.pop();
        player.hand.push(previousTopDiscard);
      } else {
        this.drawFromDeck(player);
      }
    }

    // discard played cards
    cardsToRemove.forEach((removeCard) => {
      const idx = player.hand.findIndex(
        (c) => JSON.stringify(c) === JSON.stringify(removeCard),
      );

      if (idx !== -1) {
        this.discard.push(player.hand.splice(idx, 1)[0]);
      }
    });

    this.setMessage(`${player.id} played ${cardsToRemove.length} card(s)`);

    const autoZero = this.players.find(
      (p) => this.calculateHandPoints(p.hand) === 0,
    );

    if (autoZero) {
      this.setMessage(`${autoZero.id} triggered auto challenge`);
      this.challenge(autoZero.id);
      return;
    }

    this.nextTurn();
    this.broadcastState();
  }

  /* ---------- scoring ---------- */

  calculateHandPoints(hand) {
    return hand.reduce((sum, c) => sum + this.rankValue(c), 0);
  }

  /* ---------- challenge ---------- */

  challenge(playerId) {
    const challenger = this.players[this.turn];
    if (!challenger || challenger.id !== playerId) return;

    if (
      this.circleCount < 3 &&
      this.calculateHandPoints(challenger.hand) !== 0
    ) {
      return;
    }

    const roundScores = [];

    this.players.forEach((p) => {
      const pts = this.calculateHandPoints(p.hand);
      p.roundPoints = pts;
      roundScores.push({ player: p, pts });
    });

    const min = Math.min(...roundScores.map((r) => r.pts));
    const winners = roundScores.filter((r) => r.pts === min);

    let msg;

    // const challengerScore = roundScores.find(
    //   (r) => r.player.id === challenger.id,
    // ).pts;

    if (winners.some((w) => w.player.id === challenger.id)) {
      winners.forEach((w) => (w.player.roundPoints = 0));
      msg = `Round ${this.round} winner: ${winners.map((w) => w.player.id).join(", ")}`;
      // this.emit("fcc_roundEnd", winners.id);
    } else {
      challenger.roundPoints = 40;
      winners.forEach((w) => (w.player.roundPoints = 0));
      msg = `Challenge failed!!! .Round ${this.round} winner: ${winners.map((w) => w.player.id).join(", ")}`;
    }

    // accumulate totals
    this.players.forEach((p) => {
      p.totalPoints += p.roundPoints;
    });

    this.setMessage(msg);

    this.round++;
    this.gameOver = true;

    if (this.round > 10) {
      this.endGame();
      return;
    }

    setTimeout(() => this.startRound(), 2000);

    this.broadcastState();
  }

  /* ---------- game end ---------- */

  endGame() {
    const min = Math.min(...this.players.map((p) => p.totalPoints));
    const winners = this.players
      .filter((p) => p.totalPoints === min)
      .map((p) => p.id);

    this.setMessage(`Game winner(s): ${winners.join(", ")}`);

    this.broadcastState();

    setTimeout(() => this.deleteRoom(), 4000);
  }

  deleteRoom() {
    fetch(`${process.env.SERVER_URL}/gameCompleted/${this.roomId}`, {
      method: "POST",
    }).catch(() => {});
  }

  /* ---------- snapshot ---------- */

  snapshot() {
    return {
      round: this.round,
      circleCount: this.circleCount,
      players: this.players.map((p) => ({
        id: p.id,
        handCount: p.hand.length,
        roundPoints: p.roundPoints,
        totalPoints: p.totalPoints,
      })),
      // 🔥 ALL HANDS — UI will filter
      playersHands: this.players.reduce((acc, p) => {
        acc[p.id] = p.hand;
        return acc;
      }, {}),
      turn: this.players[this.turn]?.id,
      discardTop: this.discard.at(-1),
      deckCount: this.deck.length,
      message: this.lastMessage,
    };
  }

  broadcastState() {
    this.emit("fcc_state", this.snapshot());
    if(this.players[this.turn]?.isBot){
      this.PlayBotTurn();
    }
  }

  PlayBotTurn() {
    if (this.gameOver) return;

    const player = this.players[this.turn];
    if (!player || !player.isBot) return;

    if (this.botThinking) return;
    this.botThinking = true;

    setTimeout(() => {
      try {
        const hand = player.hand;
        if (!hand.length) return;

        const discardTop = this.discard.at(-1);

        // -----------------------------------
        // helpers
        // -----------------------------------
        const rankValue = (card) => this.rankValue(card);

        const groupByRank = {};
        hand.forEach((c) => {
          if (!groupByRank[c.rank]) groupByRank[c.rank] = [];
          groupByRank[c.rank].push(c);
        });

        const botPoints = this.calculateHandPoints(hand);

        // =====================================================
        // 1️⃣ HUMAN THINKING — LOW POINTS → CHALLENGE
        // =====================================================
        if (botPoints <= 4) {
          this.setMessage(`${player.id} triggered auto challenge`);
          this.challenge(player.id);
          this.botThinking = false;
          return;
        }

        let chosenCard = null;
        let drawChoice = null;

        // =====================================================
        // 2️⃣ PLAY SAME RANK AS DISCARD TOP
        // =====================================================
        if (discardTop) {
          const sameRank = hand.find((c) => c.rank === discardTop.rank);

          if (sameRank) {
            chosenCard = sameRank;
            drawChoice = null;
          }
        }

        // =====================================================
        // 3️⃣ HAVE DUPLICATES → PLAY ONE (auto discard rest)
        // =====================================================
        if (!chosenCard) {
          const duplicateRank = Object.values(groupByRank).find(
            (cards) => cards.length >= 2,
          );

          if (duplicateRank) {
            chosenCard = duplicateRank[0];
          }
        }

        // =====================================================
        // 4️⃣ PLAY HIGHEST VALUE CARD
        // =====================================================
        if (!chosenCard) {
          chosenCard = [...hand].sort((a, b) => rankValue(b) - rankValue(a))[0];
        }

        // =====================================================
        // 5️⃣ DRAW CHOICE LOGIC
        // =====================================================
        if (discardTop) {
          const hasSameRankInHand = hand.some(
            (c) => c.rank === discardTop.rank,
          );

          if (hasSameRankInHand) {
            // prepare next turn combo
            drawChoice = "discard";
          } else if (discardTop.joker || rankValue(discardTop) <= 5) {
            drawChoice = "discard";
          } else {
            drawChoice = "deck";
          }
        }

        // =====================================================
        // PLAY
        // =====================================================
        this.playCards(player.id, chosenCard, drawChoice);
      } finally {
        this.botThinking = false;
      }
    }, 8000);
  }

  replacePlayerWithBot(oldUsername, botName) {
    const player = this.players.find((p) => p.id === oldUsername);
    if (!player) return;

    player.id = botName;
    player.isBot = true;

    this.setMessage(`${oldUsername} was replaced by BOT ${botName}`);
    this.broadcastState();
  }
}

module.exports = FourCardChallengeEngine;
