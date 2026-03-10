const EventEmitter = require("events");
const { buildDeck, shuffle } = require("./deck");
const Player = require("./player");

class SevenCardChallengeEngine extends EventEmitter {
  constructor(playerIds, roomId) {
    super();

    this.roomId = roomId;
    this.players = playerIds.map((id) => new Player(id));

    this.round = 1;
    this.turn = 0;
    this.roundStarterIndex = 0;

    this.deck = [];
    this.discard = [];
    this.discardTop = [];

    this.circleCount = 0;

    this.jokerRankOfTheRound = null;

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
    if (card.rank === this.jokerRankOfTheRound.rank) return 0;
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

    let jokerIndex = -1;
    while (jokerIndex === -1) {
      const randomIndex = Math.floor(Math.random() * this.deck.length);
      const candidate = this.deck[randomIndex];

      // assuming actual joker cards have rank "JOKER"
      if (candidate.rank !== "joker") {
        jokerIndex = randomIndex;
        this.jokerRankOfTheRound = candidate;

        // remove ONLY that one instance
        this.deck.splice(jokerIndex, 1);
      }
    }

    this.players.forEach((p) => {
      p.hand = [];
      p.roundPoints = 0;

      for (let i = 0; i < 7; i++) {
        p.hand.push(this.deck.pop());
      }
    });

    let topDeckCard = this.deck.pop();

    this.discard.push(topDeckCard);
    this.discardTop = [topDeckCard];

    this.turn = this.roundStarterIndex;
    this.roundStarterIndex = (this.roundStarterIndex + 1) % this.players.length;
    this.botThinking = false;

    this.setMessage(`Round ${this.round} started`);
    this.broadcastState();
  }

  /* ---------- play ---------- */

  playCards(playerId, cards, drawChoice = null, selectedDiscardCard) {
    this.botThinking = false;
    if (this.gameOver) return;
    const player = this.players[this.turn];
    if (!player || player.id !== playerId) return;
    if (!cards) return;

    this.discardTop = [];

    if (drawChoice !== null) {
      if (drawChoice === "discard" && selectedDiscardCard) {
        const index = this.discard.findIndex(
          (card) =>
            card.rank === selectedDiscardCard.rank &&
            card.suit === selectedDiscardCard.suit,
        );

        if (index !== -1) {
          this.discard.splice(index, 1); // removes ONLY that one instance
        }

        player.hand.push(selectedDiscardCard);
      } else {
        this.drawFromDeck(player);
      }
    }

    // discard played cards
    cards.forEach((removeCard) => {
      const idx = player.hand.findIndex(
        (c) => JSON.stringify(c) === JSON.stringify(removeCard),
      );

      if (idx !== -1) {
        let card = player.hand.splice(idx, 1)[0];
        this.discard.push(card);
        this.discardTop.push(card);
      }
    });

    this.setMessage(`${player.id} played ${cards.length} card(s)`);

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
      //   this.emit("scc_roundEnd", winners.id);
    } else {
      challenger.roundPoints = 70;
      winners.forEach((w) => (w.player.roundPoints = 0));
      msg = `Challenge failed!!! . Round ${this.round} winner: ${winners.map((w) => w.player.id).join(", ")}`;
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
    fetch(`http://localhost:3000/gameCompleted/${this.roomId}`, {
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
      discardTop: this.discardTop,
      deckCount: this.deck.length,
      message: this.lastMessage,
      jokerRankOfTheRound: this.jokerRankOfTheRound,
    };
  }

  broadcastState() {
    this.emit("scc_state", this.snapshot());
    if (this.players[this.turn]?.isBot) {
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
        const hand = [...player.hand];
        const discardTop = this.discardTop || [];
        const jokerRank = this.jokerRankOfTheRound.rank;

        const rankValue = (card) => this.rankValue(card);

        const seqValue = (card) => {
          const order = {
            'A': 1,
            '2': 2,
            '3': 3,
            '4': 4,
            '5': 5,
            '6': 6,
            '7': 7,
            '8': 8,
            '9': 9,
            '10': 10,
            'J': 11,
            'Q': 12,
            'K': 13,
          };
          return order[card.rank];
        };

        const isWildcard = (card) => card.joker || card.rank === jokerRank;

        const handPoints = this.calculateHandPoints(hand);

        /* ---------------------------
     1️⃣ CHALLENGE LOGIC
  --------------------------- */

        if (handPoints <= 4) {
          this.setMessage(`${player.id} triggered auto challenge`);
          this.challenge(player.id);
          this.botThinking = false;
          return;
        }

        let chosenCards = null;
        let drawChoice = null;
        let selectedDiscardCard = null;

        /* ---------------------------
     HELPERS
  --------------------------- */

        const groupByRank = {};
        hand.forEach((c) => {
          if (!groupByRank[c.rank]) groupByRank[c.rank] = [];
          groupByRank[c.rank].push(c);
        });

        const groupBySuit = {};
        hand.forEach((c) => {
          if (!groupBySuit[c.suit]) groupBySuit[c.suit] = [];
          groupBySuit[c.suit].push(c);
        });

        const discardRanks = discardTop.map((c) => c.rank);

        const containsRealDiscardRank = (cards) =>
          cards.some((c) => discardRanks.includes(c.rank));

        /* =================================================
     2️⃣ RUMMY SEARCH WITH JOKER GAP FILL
  ================================================= */

        const findRummy = () => {
          const jokers = hand.filter((c) => isWildcard(c));

          for (let suit in groupBySuit) {
            const suitCards = groupBySuit[suit]
              .filter((c) => !isWildcard(c))
              .sort((a, b) => seqValue(a) - seqValue(b));

            for (let i = 0; i < suitCards.length; i++) {
              let sequence = [suitCards[i]];
              let last = seqValue(suitCards[i]);
              let jokerCount = jokers.length;

              for (let j = i + 1; j < suitCards.length; j++) {
                const current = seqValue(suitCards[j]);
                const gap = current - last - 1;

                // prevent circular K-A
                if (last === 13 && current === 1) break;

                if (gap === 0) {
                  sequence.push(suitCards[j]);
                  last = current;
                } else if (gap > 0 && gap <= jokerCount) {
                  for (let g = 0; g < gap; g++) {
                    sequence.push(jokers[g]);
                  }

                  jokerCount -= gap;
                  sequence.push(suitCards[j]);
                  last = current;
                } else {
                  break;
                }

                if (sequence.length >= 3) {
                  return sequence;
                }
              }
            }
          }

          return null;
        };

        let rummy = findRummy();

        if (rummy && containsRealDiscardRank(rummy)) {
          chosenCards = rummy;
          drawChoice = null;
        }

        /* ---------- SAME RANK SET ---------- */

        if (!chosenCards) {
          for (let rank in groupByRank) {
            const set = groupByRank[rank];

            if (set.length >= 2 && discardRanks.includes(rank)) {
              chosenCards = set;
              drawChoice = null;
              break;
            }
          }
        }

        /* ---------- SINGLE CARD ---------- */

        if (!chosenCards) {
          const single = hand.find((c) => discardRanks.includes(c.rank));

          if (single) {
            chosenCards = [single];
            drawChoice = null;
          }
        }

        /* =================================================
     3️⃣ NORMAL PLAY
  ================================================= */

        if (!chosenCards && rummy) {
          chosenCards = rummy;
        }

        if (!chosenCards) {
          for (let rank in groupByRank) {
            if (groupByRank[rank].length >= 2) {
              chosenCards = groupByRank[rank];
              break;
            }
          }
        }

        if (!chosenCards) {
          const sorted = hand
            .filter((c) => !isWildcard(c))
            .sort((a, b) => rankValue(b) - rankValue(a));

          chosenCards = [sorted[0]];
        }

        /* =================================================
     4️⃣ DRAW LOGIC
  ================================================= */

        if (drawChoice === null && chosenCards) {
          this.playCards(player.id, chosenCards, null, null);
          return;
        }

        let bestDiscard = null;

        for (let card of discardTop) {
          if (isWildcard(card)) {
            bestDiscard = card;
            break;
          }
        }

        if (!bestDiscard) {
          for (let card of discardTop) {
            const sameRank = hand.find((c) => c.rank === card.rank);
            if (sameRank) {
              bestDiscard = card;
              break;
            }
          }
        }

        if (!bestDiscard) {
          for (let card of discardTop) {
            if (rankValue(card) <= 4) {
              bestDiscard = card;
              break;
            }
          }
        }

        if (bestDiscard) {
          drawChoice = "discard";
          selectedDiscardCard = bestDiscard;
        } else {
          drawChoice = "deck";
        }

        this.playCards(player.id, chosenCards, drawChoice, selectedDiscardCard);
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

module.exports = SevenCardChallengeEngine;
