const EventEmitter = require("events");
const buildDeck = require("./deck");
const Player = require("./player");

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

class FiveAliveEngine extends EventEmitter {
  constructor(playerIds, roomId) {
    super();
    this.roomId = roomId;
    this.players = playerIds.map((id) => new Player(id));
    this.turn = 0;
    this.direction = 1;
    this.score = 0;
    this.deck = [];
    this.discard = [];
    this.gameOver = false;
    this.lastMessage = "Game started";
    this.lastDiscardedCard = null;
    this.activePlayers = []; // active players per round;
    this.roundStarterIndex = 0;
    this.botThinking = false;
  }

  setMessage(msg) {
    this.lastMessage = msg;
  }

  deal() {
    this.activePlayers.forEach((p) => {
      for (let i = 0; i < 10; i++) {
        p.hand.push(this.draw());
      }
    });
  }

  draw() {
    if (!this.deck.length) {
      this.deck = shuffle(this.discard.splice(0));
      this.setMessage("Deck reshuffled");
    }
    return this.deck.pop();
  }

  nextTurn(skipCount = 1) {
    if (this.gameOver) return;
    if (!this.activePlayers.length) return;
    for (let i = 0; i < skipCount; i++) {
      do {
        this.turn =
          (this.turn + this.direction + this.activePlayers.length) %
          this.activePlayers.length;
      } while (!this.activePlayers[this.turn].active);
    }
  }

  play(playerId, cardIndex) {
    this.botThinking = false;
    if (this.gameOver) return;
    const player = this.activePlayers[this.turn];
    if (player.id !== playerId) return;

    const card = player.hand.splice(cardIndex, 1)[0];
    this.discard.push(card);

    this.lastDiscardedCard = card.type === "number" ? card.value : card.power;
    this.applyCard(player, card);

    const emptyHandPlayer = this.activePlayers.find((p) => p.hand.length === 0);
    if (emptyHandPlayer) {
      this.emit("fivealive_roundEnd", emptyHandPlayer.id);
      return;
    }

    this.broadcastState();
  }

  startRound() {
    this.score = 0;
    this.deck = buildDeck();
    this.discard = [];
    this.lastDiscardedCard = null;
    this.gameOver = false;
    this.direction = 1;

    // active players
    this.activePlayers = this.players.filter((p) => p.lives > 0);

    this.activePlayers.forEach((p) => {
      p.active = true;
      p.hand = [];
    });

    // 🔥 find next valid round starter
    let attempts = 0;
    while (
      attempts < this.players.length &&
      this.players[this.roundStarterIndex].lives <= 0
    ) {
      this.roundStarterIndex =
        (this.roundStarterIndex + 1) % this.players.length;
      attempts++;
    }

    const starterId = this.players[this.roundStarterIndex].id;

    // map starter to activePlayers index
    this.turn = this.activePlayers.findIndex((p) => p.id === starterId);

    // prepare next round starter pointer
    this.roundStarterIndex = (this.roundStarterIndex + 1) % this.players.length;

    this.deal();
    this.setMessage(`${starterId} starts this round`);
    this.broadcastState();
  }

  applyCard(player, card) {
    if (this.gameOver) return;
    if (card.type === "number") {
      const newScore = this.score + card.value;
      if (card.value !== 0 && newScore > 21) {
        this.loseLife(player);
        this.score = 0;
        return;
      }
      this.score = newScore;
      this.nextTurn();
      this.setMessage(`${player.id} played ${card.value}`);
    } else {
      // Power cards
      switch (card.power) {
        case "reverse":
          this.direction *= -1;
          this.nextTurn();
          this.setMessage(`${player.id} played reverse`);
          break;

        case "skip":
          this.nextTurn(2); // skip next player
          this.setMessage(`${player.id} played skip`);
          break;

        case "eq0":
          this.score = 0;
          this.nextTurn();
          this.setMessage(`${player.id} set score to 0`);
          break;

        case "eq10":
          this.score = 10;
          this.nextTurn();
          this.setMessage(`${player.id} set score to 10`);
          break;

        case "eq21":
          this.score = 21;
          this.nextTurn();
          this.setMessage(`${player.id} set score to 21`);
          break;

        case "plus1":
          this.activePlayers.forEach((p) => {
            if (p.id !== player.id) p.hand.push(this.draw());
          });
          this.nextTurn();
          this.setMessage(`${player.id} played plus1`);
          break;

        case "plus2":
          this.activePlayers.forEach((p) => {
            if (p.id !== player.id) {
              p.hand.push(this.draw());
              p.hand.push(this.draw());
            }
          });
          this.nextTurn();
          this.setMessage(`${player.id} played plus2`);
          break;

        case "bomb":
          [...this.activePlayers].forEach((p) => {
            if (p.id === player.id) return;

            // find ONE zero card only
            const zeroIndex = p.hand.findIndex(
              (c) => c.type === "number" && c.value === 0,
            );

            if (zeroIndex !== -1) {
              // remove exactly ONE zero
              const [zeroCard] = p.hand.splice(zeroIndex, 1);
              this.discard.push(zeroCard);
            } else {
              // no zero → lose life
              this.loseLife(p, false);
            }
          });

          this.score = 0;
          this.nextTurn();
          this.setMessage(`${player.id} played bomb`);
          break;

        case "pass":
          this.nextTurn();
          this.setMessage(`${player.id} played Pass me by`);
          break;

        case "shuffle":
          // collect all hands
          let collected = [];
          this.activePlayers.forEach((p) => {
            collected.push(...p.hand);
            p.hand = [];
          });
          shuffle(collected);

          // redistribute starting from next player
          let idx =
            (this.turn + this.direction + this.activePlayers.length) %
            this.activePlayers.length;
          while (collected.length) {
            const p = this.activePlayers[idx];
            p.hand.push(collected.pop());
            idx =
              (idx + this.direction + this.activePlayers.length) %
              this.activePlayers.length;
          }

          this.score = 0;
          this.nextTurn();
          this.setMessage(`${player.id} played shuffle`);
          break;
      }
    }
  }

  loseLife(player, removeFromRound = true) {
    // --- lose life ---
    player.lives--;
    player.active = player.lives > 0;

    // find player in active round list
    const index = this.activePlayers.findIndex((p) => p.id === player.id);

    if (index !== -1) {
      // decide removal rule
      const shouldRemove = removeFromRound || player.lives <= 0;

      if (shouldRemove) {
        // remove from active round players
        this.discard.push(...player.hand);
        player.hand = [];
        this.activePlayers.splice(index, 1);

        // 🔥 SAFE TURN RECOVERY

        if (this.activePlayers.length === 0) {
          this.turn = 0;
        } else if (index < this.turn) {
          // removed player was before current turn
          this.turn--;
        } else if (index === this.turn) {
          // current player removed → move to next valid slot

          if (this.direction === 1) {
            if (this.turn >= this.activePlayers.length) {
              this.turn = 0;
            }
          } else {
            this.turn--;
            if (this.turn < 0) {
              this.turn = this.activePlayers.length - 1;
            }
          }
        }
      }
    }

    // --- message + state ---
    this.setMessage(`${player.id} lost a life`);
    this.broadcastState();

    // 🔥 ROUND COMPLETION SAFETY
    if (this.activePlayers.length === 1) {
      const roundWinner = this.activePlayers[0];
      if (this.checkMatchWinner()) {
        // Game completed → delete room
        setTimeout(() => {
          this.handleGameCompletion();
        }, 4000);
        return;
      } else {
        // Round completed → trigger roundEnd event
        this.emit("fivealive_roundEnd", roundWinner.id);
        return;
      }
    }
  }

  checkMatchWinner() {
    const anyDead = this.players.some((p) => p.lives === 0);

    if (anyDead) {
      // Game over → player(s) with most lives are winners
      const maxLives = Math.max(...this.players.map((p) => p.lives));
      const winners = this.players.filter((p) => p.lives === maxLives);

      this.gameOver = true;

      if (winners.length === 1) {
        this.setMessage(`Game over, ${winners[0].id} wins the game`);
      } else {
        const winnerNames = winners.map((p) => p.id).join(", ");
        this.setMessage(`Game over, winners: ${winnerNames}`);
      }

      this.broadcastState();
      return true;
    }
    return false;
  }

  handleGameCompletion() {
    this.gameOver = true;

    // Call room deletion API
    this.deleteRoom();
  }

  deleteRoom() {
    // Replace with your API call
    fetch(`http://localhost:3000/gameCompleted/${this.roomId}`, {
      method: "POST",
    })
      .then(() => console.log("Room deleted"))
      .catch((err) => console.error("Failed to delete room", err));
  }

  snapshot() {
    return {
      players: this.players.map((p) => ({
        username: p.id,
        lives: p.lives,
        cardsCount: p.hand.length,
      })),
      cardsList: this.players.map((p) => ({
        username: p.id,
        cards: [...p.hand],
      })),
      score: this.score,
      currentTurn: this.activePlayers[this.turn]?.id,
      deckCount: this.deck.length,
      discardCount: this.discard.length,
      message: this.lastMessage,
      lastDiscardedCard: this.lastDiscardedCard,
      activePlayers: this.activePlayers.map((p) => p.id),
    };
  }

  broadcastState() {
    this.emit("fivealive_state", this.snapshot());
    if(this.activePlayers[this.turn]?.isBot){
      this.playBotTurn();
    }
  }

  playBotTurn() {
    if (this.gameOver) return;
    if (!this.activePlayers.length) return;

    const player = this.activePlayers[this.turn];
    if (!player || !player.isBot) return;

    if (this.botThinking) return;
    this.botThinking = true;

    setTimeout(() => {
      try {
        const hand = player.hand;

        const otherPlayers = this.activePlayers.filter(
          (p) => p.id !== player.id,
        );

        const dangerPlayers = otherPlayers.filter((p) => p.hand.length <= 2);

        // ---------- helpers ----------
        const findCardIndex = (predicate) => hand.findIndex(predicate);

        const findAllIndexes = (predicate) =>
          hand.map((c, i) => (predicate(c) ? i : -1)).filter((i) => i !== -1);

        const powerIndex = (name) =>
          findCardIndex((c) => c.type !== "number" && c.power === name);

        const zeroIndexes = findAllIndexes(
          (c) => c.type === "number" && c.value === 0,
        );

        const numberIndexes = findAllIndexes((c) => c.type === "number");

        // 👉 find NEXT player using turn + direction
        const nextIndex =
          (this.turn + this.direction + this.activePlayers.length) %
          this.activePlayers.length;

        const nextPlayer = this.activePlayers[nextIndex];
        const nextPlayerDanger = nextPlayer && nextPlayer.hand.length <= 2;

        let chosenIndex = -1;

        // =========================================================
        // 1️⃣ DEFENCE LOGIC
        // =========================================================
        if (dangerPlayers.length > 0) {
          // skip ONLY if next player dangerous
          if (nextPlayerDanger && powerIndex("skip") !== -1) {
            chosenIndex = powerIndex("skip");
          } else if (powerIndex("plus1") !== -1) {
            chosenIndex = powerIndex("plus1");
          } else if (powerIndex("plus2") !== -1) {
            chosenIndex = powerIndex("plus2");
          } else if (powerIndex("shuffle") !== -1) {
            chosenIndex = powerIndex("shuffle");
          } else if (powerIndex("bomb") !== -1) {
            chosenIndex = powerIndex("bomb");
          }
        }

        // =========================================================
        // 2️⃣ NUMBER PLAY (≤21 rule + keep two zeros)
        // =========================================================
        if (chosenIndex === -1 && this.score < 21) {
          let bestIndex = -1;
          let bestValue = -1;

          numberIndexes.forEach((idx) => {
            const card = hand[idx];
            const newScore = this.score + card.value;

            if (card.value !== 0 && newScore > 21) return;

            // keep 2 zeros safety
            if (card.value === 0 && zeroIndexes.length <= 2) return;

            if (card.value > bestValue) {
              bestValue = card.value;
              bestIndex = idx;
            }
          });

          if (bestIndex !== -1) chosenIndex = bestIndex;
        }

        // =========================================================
        // 3️⃣ PASS → REVERSE → EQ21
        // =========================================================
        if (chosenIndex === -1) {
          chosenIndex =
            powerIndex("pass") !== -1
              ? powerIndex("pass")
              : powerIndex("reverse") !== -1
                ? powerIndex("reverse")
                : powerIndex("eq21");
        }

        // =========================================================
        // 4️⃣ EQ10 → EQ0
        // =========================================================
        if (chosenIndex === -1) {
          chosenIndex =
            powerIndex("eq10") !== -1 ? powerIndex("eq10") : powerIndex("eq0");
        }

        // =========================================================
        // 5️⃣ PLUS1 → PLUS2
        // =========================================================
        if (chosenIndex === -1) {
          chosenIndex =
            powerIndex("plus1") !== -1
              ? powerIndex("plus1")
              : powerIndex("plus2");
        }

        // =========================================================
        // 6️⃣ FINAL FALLBACK
        // zero(extra) → skip → bomb → shuffle → zero
        // =========================================================
        if (chosenIndex === -1) {
          if (zeroIndexes.length > 1) {
            chosenIndex = zeroIndexes[0];
          } else if (powerIndex("skip") !== -1) {
            chosenIndex = powerIndex("skip");
          } else if (powerIndex("bomb") !== -1) {
            chosenIndex = powerIndex("bomb");
          } else if (powerIndex("shuffle") !== -1) {
            chosenIndex = powerIndex("shuffle");
          } else if (zeroIndexes.length) {
            chosenIndex = zeroIndexes[0];
          }
        }

        // =========================================================
        // 7️⃣ NO DEFENCE LEFT → SACRIFICE PLAY
        // play RANDOM number even if >21
        // =========================================================
        if (chosenIndex === -1 && numberIndexes.length) {
          const random =
            numberIndexes[Math.floor(Math.random() * numberIndexes.length)];
          chosenIndex = random;
        }

        // FINAL SAFETY
        if (chosenIndex === -1 && hand.length) {
          chosenIndex = 0;
        }

        if (chosenIndex !== -1) {
          this.play(player.id, chosenIndex);
        }
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

module.exports = FiveAliveEngine;
