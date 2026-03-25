const EventEmitter = require("events");
const { buildDeck } = require("./deck");
const Player = require("./player");
const { ROUTES } = require("./routes"); // ← single source of truth

// ── Build points by route length ─────────────────────────────────────────────
const BUILD_POINTS = { 1:1, 2:2, 3:4, 4:7, 6:15, 8:21 };
function buildPoints(length) { return BUILD_POINTS[length] || 0; }

// ── Player train colors (distinct from all card/route colors) ─────────────────
const PLAYER_TRAIN_COLORS = [
  "#00e5ff", // vivid cyan
  "#ff4081", // hot magenta
  "#76ff03", // electric lime
  "#ff6d00", // deep amber
  "#e040fb", // bright violet
];

// ── Shuffle ───────────────────────────────────────────────────────────────────
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── BFS connectivity ──────────────────────────────────────────────────────────
function isConnected(claimedRoutes, from, to) {
  if (from === to) return true;
  const adj = {};
  claimedRoutes.forEach((r) => {
    (adj[r.from] = adj[r.from] || []).push(r.to);
    (adj[r.to]   = adj[r.to]   || []).push(r.from);
  });
  const visited = new Set();
  const queue = [from];
  while (queue.length) {
    const city = queue.shift();
    if (city === to) return true;
    if (visited.has(city)) continue;
    visited.add(city);
    (adj[city] || []).forEach((n) => queue.push(n));
  }
  return false;
}

// ── 58 Destination Tickets ────────────────────────────────────────────────────
const TICKETS = [
  { id:"T1",  from:"Ahmadabad",  to:"Bareilly",   points:5  },
  { id:"T2",  from:"Ambala",     to:"Ratiam",     points:5  },
  { id:"T3",  from:"Bezwada",    to:"Bombay",     points:5  },
  { id:"T4",  from:"Bhopal",     to:"Mormugau",   points:5  },
  { id:"T5",  from:"Bilaspur",   to:"Dhubri",     points:5  },
  { id:"T6",  from:"Delhi",      to:"Lahore",     points:5  },
  { id:"T7",  from:"Jaipur",     to:"Patna",      points:5  },
  { id:"T8",  from:"Jaipur",     to:"Poona",      points:5  },
  { id:"T9",  from:"Jaipur",     to:"Raipur",     points:5  },
  { id:"T10", from:"Jodhpur",    to:"Khandwa",    points:5  },
  { id:"T11", from:"Jodhpur",    to:"Lucknow",    points:5  },
  { id:"T12", from:"Katni",      to:"Khandwa",    points:5  },
  { id:"T13", from:"Katni",      to:"Waltain",    points:5  },
  { id:"T14", from:"Manmad",     to:"Raipur",     points:5  },
  { id:"T15", from:"Ahmadabad",  to:"Karachi",    points:6  },
  { id:"T16", from:"Bareilly",   to:"Calcutta",   points:6  },
  { id:"T17", from:"Bhopal",     to:"Calcutta",   points:6  },
  { id:"T18", from:"Bombay",     to:"Quilon",     points:6  },
  { id:"T19", from:"Madras",     to:"Quilon",     points:6  },
  { id:"T20", from:"Mangalore",  to:"Waltain",    points:6  },
  { id:"T21", from:"Agra",       to:"Rohri",      points:7  },
  { id:"T22", from:"Ahmadabad",  to:"Calicut",    points:7  },
  { id:"T23", from:"Bhatinda",   to:"Bilaspur",   points:7  },
  { id:"T24", from:"Bombay",     to:"Lucknow",    points:7  },
  { id:"T25", from:"Delhi",      to:"Karachi",    points:7  },
  { id:"T26", from:"Erode",      to:"Manmad",     points:7  },
  { id:"T27", from:"Guntakal",   to:"Raipur",     points:7  },
  { id:"T28", from:"Karachi",    to:"Poona",      points:7  },
  { id:"T29", from:"Agra",       to:"Jarhat",     points:8  },
  { id:"T30", from:"Bezwada",    to:"Ratiam",     points:8  },
  { id:"T31", from:"Calcutta",   to:"Indur",      points:8  },
  { id:"T32", from:"Katni",      to:"Wadi",       points:8  },
  { id:"T33", from:"Ahmadabad",  to:"Waltain",    points:9  },
  { id:"T34", from:"Bhatinda",   to:"Manmad",     points:9  },
  { id:"T35", from:"Bhopal",     to:"Peshawar",   points:9  },
  { id:"T36", from:"Calcutta",   to:"Erode",      points:9  },
  { id:"T37", from:"Chittagong", to:"Delhi",      points:9  },
  { id:"T38", from:"Delhi",      to:"Indur",      points:9  },
  { id:"T39", from:"Guntakal",   to:"Jodhpur",    points:9  },
  { id:"T40", from:"Jacobabad",  to:"Ratiam",     points:9  },
  { id:"T41", from:"Madras",     to:"Patna",      points:9  },
  { id:"T42", from:"Ambala",     to:"Mormugau",   points:10 },
  { id:"T43", from:"Bareilly",   to:"Guntakal",   points:10 },
  { id:"T44", from:"Bilaspur",   to:"Calicut",    points:10 },
  { id:"T45", from:"Bombay",     to:"Jacobabad",  points:10 },
  { id:"T46", from:"Chittagong", to:"Khandwa",    points:10 },
  { id:"T47", from:"Mormugau",   to:"Patna",      points:10 },
  { id:"T48", from:"Calicut",    to:"Delhi",      points:11 },
  { id:"T49", from:"Chittagong", to:"Wadi",       points:11 },
  { id:"T50", from:"Erode",      to:"Lucknow",    points:11 },
  { id:"T51", from:"Dhubri",     to:"Lahore",     points:12 },
  { id:"T52", from:"Dhubri",     to:"Mangalore",  points:12 },
  { id:"T53", from:"Mangalore",  to:"Rohri",      points:12 },
  { id:"T54", from:"Bezwada",    to:"Bhatinda",   points:13 },
  { id:"T55", from:"Bombay",     to:"Jarhat",     points:13 },
  { id:"T56", from:"Calcutta",   to:"Jacobabad",  points:13 },
  { id:"T57", from:"Lahore",     to:"Wadi",       points:13 },
  { id:"T58", from:"Madras",     to:"Peshawar",   points:17 },
];

const INITIAL_SELECTION_TIMEOUT_MS = 240_000;

// ── Engine ────────────────────────────────────────────────────────────────────
class TicketToRideEngine extends EventEmitter {
  constructor(playerIds, roomId) {
    super();
    this.roomId = roomId;
    this.players = playerIds.map((id) => new Player(id));
    this.turn = 0;
    this.deck = [];
    this.discard = [];
    this.ticketDeck = [];
    this.ticketDiscard = [];
    this.faceUpCards = [];
    this.routes = [];
    this.phase = "waiting";
    this.finalRound = false;
    this.finalRoundCallerIndex = null;
    this.lastRoundCalledBy = null;
    this.finalScores = null;
    this.lastMessage = "Ticket to Ride (India 1911) ready.";
    this._initialSelectionTimer = null;
    this.initialSelectionSecondsLeft = 0;
    this._countdownInterval = null;
    this.botThinking = false;
  }

  setMessage(msg) { this.lastMessage = msg; }

  // ── Deck helpers ──────────────────────────────────────────────────────────
  drawFromDeck() {
    if (!this.deck.length) {
      if (!this.discard.length) return null;
      this.deck = shuffle(this.discard.splice(0));
    }
    return this.deck.pop();
  }

  refillFaceUpCards() {
    while (this.faceUpCards.length < 5) {
      const card = this.drawFromDeck();
      if (!card) break;
      this.faceUpCards.push(card);
    }
    this._checkLocoFlood();
  }

  _checkLocoFlood() {
    let attempts = 0;
    while (this.faceUpCards.filter((c) => c.color === "locomotive").length >= 3) {
      this.deck = shuffle([...this.deck, ...this.faceUpCards.splice(0), ...this.discard.splice(0)]);
      for (let i = 0; i < 5; i++) {
        const card = this.deck.pop();
        if (card) this.faceUpCards.push(card);
      }
      if (++attempts > 10) break;
    }
  }

  // ── Ticket helpers ────────────────────────────────────────────────────────
  _replenishTicketDeck() {
    if (this.ticketDeck.length === 0 && this.ticketDiscard.length > 0)
      this.ticketDeck = shuffle(this.ticketDiscard.splice(0));
  }

  _drawTickets(count) {
    const drawn = [];
    for (let i = 0; i < count; i++) {
      this._replenishTicketDeck();
      if (!this.ticketDeck.length) break;
      drawn.push(this.ticketDeck.shift());
    }
    return drawn;
  }

  // ── Game start ────────────────────────────────────────────────────────────
  startGame() {
    this.deck    = shuffle(buildDeck());
    this.discard = [];
    this.ticketDeck    = shuffle([...TICKETS]);
    this.ticketDiscard = [];
    this.botThinking = false;
    // Deep-copy routes from the single source; add runtime fields
    this.routes = ROUTES.map((r) => ({
      ...r,
      claimedBy:  null,
      trainColor: null,
    }));
    this.faceUpCards = [];
    this.phase = "initial_selection";
    this.finalRound = false;
    this.finalRoundCallerIndex = null;
    this.lastRoundCalledBy = null;
    this.finalScores = null;
    this.initialSelectionSecondsLeft = INITIAL_SELECTION_TIMEOUT_MS / 1000;

    this.players.forEach((p, i) => {
      p.hand = [];
      p.tickets = [];
      p.pendingTickets = [];
      p.claimedRoutes = [];
      p.score = 0;
      p.trainsLeft = 45;
      p.initialSelectionDone = false;
      p.ticketResults = null;
      p.trainColor = PLAYER_TRAIN_COLORS[i % PLAYER_TRAIN_COLORS.length];
      for (let j = 0; j < 4; j++) {
        const card = this.drawFromDeck();
        if (card) p.hand.push(card);
      }
      p.pendingTickets = this._drawTickets(4);
    });

    this.refillFaceUpCards();
    this.setMessage(
      `Game started. You have ${INITIAL_SELECTION_TIMEOUT_MS / 1000}s to discard up to 2 tickets (keep at least 2).`
    );
    this.broadcastState();

    this._countdownInterval = setInterval(() => {
      this.initialSelectionSecondsLeft = Math.max(0, this.initialSelectionSecondsLeft - 1);
    }, 1000);

    this._initialSelectionTimer = setTimeout(() => {
      this._clearCountdown();
      this.players.forEach((p) => {
        if (!p.initialSelectionDone) {
          const autoKept     = p.pendingTickets.slice(0, 2);
          const autoDiscarded = p.pendingTickets.slice(2);
          p.tickets = autoKept;
          p.pendingTickets = [];
          p.initialSelectionDone = true;
          if (autoDiscarded.length) this.ticketDiscard.push(...autoDiscarded);
        }
      });
      this._startPlaying();
    }, INITIAL_SELECTION_TIMEOUT_MS);
  }

  _clearCountdown() {
    if (this._initialSelectionTimer) { clearTimeout(this._initialSelectionTimer);  this._initialSelectionTimer = null; }
    if (this._countdownInterval)     { clearInterval(this._countdownInterval);     this._countdownInterval = null; }
    this.initialSelectionSecondsLeft = 0;
  }

  _startPlaying() {
    this.botThinking = false;
    this.phase = "playing";
    this.turn  = Math.floor(Math.random() * this.players.length);
    this.setMessage(`All players ready! ${this.players[this.turn].id} goes first!`);
    this.broadcastState();
  }

  // ── Initial ticket selection ──────────────────────────────────────────────
  discardInitialTickets(playerId, discardIds = []) {
    if (this.phase !== "initial_selection") return this._err("Not in initial ticket selection phase.");
    const player = this._player(playerId);
    if (!player) return this._err("Player not found.");
    if (player.initialSelectionDone)  return this._err("You already made your selection.");

    const toDiscard = player.pendingTickets.filter((t) =>  discardIds.includes(t.id));
    const toKeep    = player.pendingTickets.filter((t) => !discardIds.includes(t.id));
    if (toKeep.length < 2) return this._err("You must keep at least 2 destination tickets.");

    player.tickets = toKeep;
    player.pendingTickets = [];
    player.initialSelectionDone = true;
    if (toDiscard.length) this.ticketDiscard.push(...toDiscard);

    this.setMessage(`${playerId} confirmed their starting tickets.`);
    if (this.players.every((p) => p.initialSelectionDone)) {
      this._clearCountdown();
      this._startPlaying();
    } else {
      this.broadcastState();
    }
  }

  // ── Turn helpers ──────────────────────────────────────────────────────────
  isPlayerTurn(playerId) {
    return this.phase === "playing" && this.players[this.turn]?.id === playerId;
  }
  _player(playerId) { return this.players.find((p) => p.id === playerId); }
  _err(msg) { this.setMessage(msg); this.broadcastState(); }

  nextTurn() {
    if (this.phase !== "playing") return;
    this.turn = (this.turn + 1) % this.players.length;
    if (this.finalRound && this.turn === this.finalRoundCallerIndex) this._endGame();
  }

  // ── Take cards ────────────────────────────────────────────────────────────
  takeCards(playerId, { source, indices = [] } = {}) {
    this.botThinking = false;
    if (!this.isPlayerTurn(playerId)) return this._err("Not your turn.");
    const player = this._player(playerId);
    if (!player) return;
    if (player.pendingTickets.length > 0) return this._err("Confirm your pending tickets first.");

    if (source === "deck") {
      const c1 = this.drawFromDeck(), c2 = this.drawFromDeck();
      if (!c1) return this._err("Deck is empty.");
      if (c1) player.hand.push(c1);
      if (c2) player.hand.push(c2);
      this.setMessage(`${playerId} drew 2 cards from the deck.`);
    } else if (source === "topPane") {
      if (!Array.isArray(indices) || indices.length < 1 || indices.length > 2)
        return this._err("Provide 1 or 2 card indices for topPane draw.");
      for (const idx of indices)
        if (idx < 0 || idx >= this.faceUpCards.length) return this._err(`Invalid card index: ${idx}.`);
      if (indices.length === 1) {
        const card = this.faceUpCards.splice(indices[0], 1)[0];
        player.hand.push(card);
        this.refillFaceUpCards();
        this.setMessage(`${playerId} took 1 face-up ${card.color} card.`);
      } else {
        for (const idx of indices)
          if (this.faceUpCards[idx]?.color === "locomotive")
            return this._err("Cannot take a locomotive as part of a 2-card draw. Take it alone.");
        const [hi, lo] = [...indices].sort((a, b) => b - a);
        const card1 = this.faceUpCards.splice(hi, 1)[0];
        const card2 = this.faceUpCards.splice(lo, 1)[0];
        player.hand.push(card1, card2);
        this.refillFaceUpCards();
        this.setMessage(`${playerId} drew 2 face-up cards (${card1.color}, ${card2.color}).`);
      }
    } else {
      return this._err("Invalid source. Use 'deck' or 'topPane'.");
    }
    this.nextTurn();
    this.broadcastState();
  }

  // ── Take tickets (step 1) ─────────────────────────────────────────────────
  takeTickets(playerId) {
    this.botThinking = false;
    if (!this.isPlayerTurn(playerId)) return this._err("Not your turn.");
    const player = this._player(playerId);
    if (!player) return;
    if (player.pendingTickets.length > 0) return this._err("You already have pending tickets to confirm.");
    this._replenishTicketDeck();
    if (!this.ticketDeck.length) return this._err("No destination tickets remaining.");
    if (this.ticketDeck.length < 3 && this.ticketDiscard.length > 0)
      this.ticketDeck = shuffle([...this.ticketDeck, ...this.ticketDiscard.splice(0)]);
    player.pendingTickets = this._drawTickets(3);
    this.setMessage(`${playerId} drew ${player.pendingTickets.length} destination ticket(s). Keep at least 1.`);
    this.broadcastState();
  }

  // ── Discard tickets (step 2) ──────────────────────────────────────────────
  discardTickets(playerId, discardIds = []) {
    this.botThinking = false;
    if (this.phase !== "playing")       return this._err("Not in playing phase.");
    if (!this.isPlayerTurn(playerId))   return this._err("Not your turn.");
    const player = this._player(playerId);
    if (!player) return;
    if (!player.pendingTickets.length)  return this._err("No pending tickets to confirm.");

    const toDiscard = player.pendingTickets.filter((t) =>  discardIds.includes(t.id));
    const toKeep    = player.pendingTickets.filter((t) => !discardIds.includes(t.id));
    if (toKeep.length < 1) return this._err("Must keep at least 1 destination ticket.");

    player.tickets.push(...toKeep);
    player.pendingTickets = [];
    if (toDiscard.length) this.ticketDiscard.push(...toDiscard);

    this.setMessage(`${playerId} kept ${toKeep.length} ticket(s)${toDiscard.length ? `, discarded ${toDiscard.length}.` : "."}`);
    this.nextTurn();
    this.broadcastState();
  }

  // ── Build route ───────────────────────────────────────────────────────────
  buildRoute(playerId, routeId, cardsToUse) {
    this.botThinking = false;
    if (!this.isPlayerTurn(playerId)) return this._err("Not your turn.");
    const player = this._player(playerId);
    if (!player) return;
    if (player.pendingTickets.length > 0) return this._err("Confirm your pending tickets first.");

    const route = this.routes.find((r) => r.id === routeId);
    if (!route)          return this._err("Route not found.");
    if (route.claimedBy) return this._err("This route is already claimed.");

    // Dual-lane check: player cannot claim both lanes of same dualGroup
    if (route.dualGroup) {
      const sibling = this.routes.find(
        (r) => r.dualGroup === route.dualGroup && r.id !== routeId
      );
      if (sibling?.claimedBy === playerId)
        return this._err("You already claimed the other lane of this dual route.");
    }

    if (route.length > player.trainsLeft)
      return this._err(`Not enough trains. Route needs ${route.length}, you have ${player.trainsLeft}.`);

    if (!Array.isArray(cardsToUse) || !cardsToUse.length)
      return this._err("No cards specified.");

    const totalCards = cardsToUse.reduce((s, c) => s + c.count, 0);
    if (totalCards !== route.length)
      return this._err(`Must use exactly ${route.length} card(s), got ${totalCards}.`);

    // Ferry/loco check
    if (route.ferry) {
      const locoEntry = cardsToUse.find((c) => c.color === "locomotive");
      const locoCount = locoEntry ? locoEntry.count : 0;
      if (locoCount < route.locosRequired)
        return this._err(`Ferry route requires at least ${route.locosRequired} locomotive card(s).`);
    }

    // Color check
    const nonLoco = cardsToUse.filter((c) => c.color !== "locomotive");
    if (route.color === "gray") {
      const colors = [...new Set(nonLoco.map((c) => c.color))];
      if (colors.length > 1)
        return this._err("Gray route: all non-locomotive cards must be the same color.");
    } else {
      const wrong = nonLoco.find((c) => c.color !== route.color);
      if (wrong)
        return this._err(`Route requires ${route.color} cards (locomotives may substitute).`);
    }

    // Dry-run hand check
    const handCopy = [...player.hand];
    for (const { color, count } of cardsToUse) {
      let need = count;
      for (let i = handCopy.length - 1; i >= 0 && need > 0; i--)
        if (handCopy[i].color === color) { handCopy.splice(i, 1); need--; }
      if (need > 0) return this._err(`Not enough ${color} cards in hand.`);
    }

    // Consume cards
    for (const { color, count } of cardsToUse) {
      let toRemove = count;
      for (let i = player.hand.length - 1; i >= 0 && toRemove > 0; i--)
        if (player.hand[i].color === color) { this.discard.push(player.hand.splice(i, 1)[0]); toRemove--; }
    }

    // Claim
    route.claimedBy  = playerId;
    route.trainColor = player.trainColor;
    player.claimedRoutes.push(route);
    const pts = buildPoints(route.length);
    player.score     += pts;
    player.trainsLeft -= route.length;

    this.setMessage(`${playerId} built ${route.from} → ${route.to} (${route.length} trains) for ${pts} pts.`);
    this.nextTurn();
    this.broadcastState();
  }

  // ── Call last round ───────────────────────────────────────────────────────
  callLastRound(playerId) {
    this.botThinking = false;
    if (this.phase !== "playing")     return this._err("Not in playing phase.");
    if (!this.isPlayerTurn(playerId)) return this._err("Not your turn.");
    if (this.finalRound)              return this._err("Last round already active.");
    const player = this._player(playerId);
    if (!player) return;
    if (!this._canCallLastRound(player))
      return this._err("You still have valid moves.");

    this.finalRound = true;
    this.finalRoundCallerIndex = this.turn;
    this.lastRoundCalledBy = playerId;
    this.setMessage(`${playerId} called last round! ${this.players.length - 1} more turn(s) remaining.`);
    this.nextTurn();
    this.broadcastState();
  }

  _canCallLastRound(player) {
    if (player.trainsLeft === 0) return true;
    return !this.routes.filter((r) => !r.claimedBy).some((r) => r.length <= player.trainsLeft);
  }

  // ── End game ──────────────────────────────────────────────────────────────
  _endGame() {
    this.botThinking = false;
    this.phase = "game_over";
    this._calculateFinalScores();
    const topScore = this.finalScores[0].score;
    const winners  = this.finalScores.filter((p) => p.score === topScore);
    const msg = winners.length === 1
      ? `🏆 Winner: ${winners[0].playerId} with ${topScore} pts!`
      : `🏆 Tie! ${winners.map((p) => p.playerId).join(", ")} — all scored ${topScore} pts!`;
    this.setMessage(`Game over! ${msg}`);
    this.broadcastState();
    setTimeout(() => this.deleteRoom && this.deleteRoom(), 4000);
  }

  deleteRoom() {
    fetch(`${process.env.SERVER_URL}/gameCompleted/${this.roomId}`, { method:"POST" }).catch(() => {});
  }

  _calculateFinalScores() {
    this.players.forEach((player) => {
      const results = player.tickets.map((ticket) => {
        const completed = isConnected(player.claimedRoutes, ticket.from, ticket.to);
        const delta = completed ? ticket.points : -ticket.points;
        player.score += delta;
        return { ...ticket, completed, delta };
      });
      player.ticketResults = results;
    });
    this.finalScores = this.players
      .map((p) => ({
        playerId:      p.id,
        trainColor:    p.trainColor,
        score:         p.score,
        buildScore:    p.claimedRoutes.reduce((s, r) => s + buildPoints(r.length), 0),
        ticketResults: p.ticketResults,
      }))
      .sort((a, b) => b.score - a.score);
  }

  // ─────────────────────────────────────────────────────────────────────────────
// Drop these methods into TicketToRideEngine class.
// Also:
//   1. In broadcastState(), after the existing emit line add:
//        if (this.phase === "playing" && this.players[this.turn]?.isBot) this.PlayBotTurn();
//   2. In startGame(), inside the players.forEach loop after assigning pendingTickets add:
//        if (p.isBot) setTimeout(() => this._botDiscardInitialTickets(p), 3000);
// ─────────────────────────────────────────────────────────────────────────────

PlayBotTurn() {
  if (this.phase !== "playing") return;
  if (this.gameOver) return;

  const player = this.players[this.turn];
  if (!player || !player.isBot) return;
  if (this.botThinking) return;
  this.botThinking = true;

  const delay = 8000;
  setTimeout(() => {
    try {
      this._executeBotMove(player);
    } catch (e) {
      // Safety net — never crash the game; fall back to deck draw
      console.error("Bot error:", e);
      try { this.takeCards(player.id, { source: "deck", indices: [] }); } catch (_) {}
    } finally {
      this.botThinking = false;
    }
  }, delay);
}

// ── Bot initial ticket selection ──────────────────────────────────────────────
_botDiscardInitialTickets(player) {
  if (this.phase !== "initial_selection") return;
  if (player.initialSelectionDone) return;

  const tickets = [...player.pendingTickets];

  // Must keep all if only 2
  if (tickets.length <= 2) {
    this.discardInitialTickets(player.id, []);
    return;
  }

  // Score each ticket
  const scored = tickets.map(t => ({
    ticket: t,
    score:  this._ticketScore(t, player),
  })).sort((a, b) => b.score - a.score);

  // Pick the best synergistic pair to keep
  const keepPair = this._pickSynergisticPair(scored, player);
  const keepIds  = new Set(keepPair.map(t => t.id));
  const discardIds = tickets.filter(t => !keepIds.has(t.id)).map(t => t.id);

  this.discardInitialTickets(player.id, discardIds);
}

// Score a ticket: higher = more desirable to keep
_ticketScore(ticket, player) {
  // Already connected = keep for free points
  if (isConnected(player.claimedRoutes, ticket.from, ticket.to)) return 10000;

  const path = this._shortestPath(ticket.from, ticket.to, player);
  if (!path) return -9999; // no path at all — strongly discard

  const hops      = path.length;
  const totalCars = path.reduce((s, r) => s + r.length, 0);
  const allOpen   = path.every(r => !r.claimedBy);

  let score = ticket.points * 8;       // high-value tickets preferred
  score -= hops * 3;                   // penalty per hop
  score -= totalCars * 1.5;            // penalty for total cars needed
  if (allOpen)   score += 15;          // bonus if path is fully available
  if (hops <= 3) score += 20;          // short paths are great

  return score;
}

// Pick the 2 tickets that together require the fewest total unique routes
// (synergy = shared intermediate cities means less building overall)
_pickSynergisticPair(scored, player) {
  if (scored.length === 2) return scored.map(s => s.ticket);

  let bestPair  = scored.slice(0, 2).map(s => s.ticket);
  let bestScore = -Infinity;

  for (let i = 0; i < scored.length; i++) {
    for (let j = i + 1; j < scored.length; j++) {
      const t1 = scored[i].ticket;
      const t2 = scored[j].ticket;

      const cities1 = new Set(this._pathCities(t1, player));
      const cities2 = new Set(this._pathCities(t2, player));

      let overlap = 0;
      for (const c of cities1) if (cities2.has(c)) overlap++;

      const pairScore = scored[i].score + scored[j].score + overlap * 12;
      if (pairScore > bestScore) {
        bestScore = pairScore;
        bestPair  = [t1, t2];
      }
    }
  }
  return bestPair;
}

// Cities along the shortest path between ticket endpoints
_pathCities(ticket, player) {
  const path = this._shortestPath(ticket.from, ticket.to, player);
  if (!path) return [ticket.from, ticket.to];
  const cities = new Set([ticket.from, ticket.to]);
  path.forEach(r => { cities.add(r.from); cities.add(r.to); });
  return [...cities];
}

// ── Main bot move ─────────────────────────────────────────────────────────────
_executeBotMove(player) {
  // Handle pending mid-game tickets first
  if (player.pendingTickets.length > 0) {
    this._botKeepTickets(player);
    return;
  }

  // ── PRIORITY 1: Call last round ──────────────────────────────────────────
  if (this._canCallLastRound(player)) {
    this.callLastRound(player.id);
    return;
  }

  const handCounts  = this._countCards(player.hand);
  const unconnected = player.tickets.filter(
    t => !isConnected(player.claimedRoutes, t.from, t.to)
  );

  // ── PRIORITY 2: Take tickets if all current ones are connected ───────────
  if (
    unconnected.length === 0 &&
    player.tickets.length > 0 &&
    this.ticketDeck.length > 0 &&
    player.trainsLeft >= 3
  ) {
    // Only take tickets if we have enough trains to realistically complete
    // at least one new ticket — find the shortest available path and check
    // if its car count fits within remaining trains
    const shortestPossible = this.routes
      .filter(r => !r.claimedBy)
      .reduce((min, r) => r.length < min ? r.length : min, 999);

    if (player.trainsLeft >= shortestPossible) {
      this.takeTickets(player.id);
      return;
    }
  }

  // Compute build plan (also returns neededColors for card picking)
  const { route, cardsToUse, neededColors } = this._buildPlan(player, unconnected, handCounts);

  // ── PRIORITY 3: Build a route ────────────────────────────────────────────
  if (route && cardsToUse) {
    this.buildRoute(player.id, route.id, cardsToUse);
    return;
  }

  // ── PRIORITY 4: Take from face-up cards ─────────────────────────────────
  const faceUpIndices = this._pickFaceUpCards(player, neededColors, handCounts, unconnected);
  if (faceUpIndices) {
    this.takeCards(player.id, { source: "topPane", indices: faceUpIndices });
    return;
  }

  // ── PRIORITY 5: Draw from deck ───────────────────────────────────────────
  this.takeCards(player.id, { source: "deck", indices: [] });
}

// ── Mid-game ticket keep/discard ──────────────────────────────────────────────
_botKeepTickets(player) {
  const tickets = player.pendingTickets;

  const evaluated = tickets.map(t => {
    const path           = this._shortestPath(t.from, t.to, player);
    const connected      = isConnected(player.claimedRoutes, t.from, t.to);
    const unbuilt        = path ? path.filter(r => !r.claimedBy) : [];
    const remainingHops  = unbuilt.length;
    const carsNeeded     = unbuilt.reduce((s, r) => s + r.length, 0);
    const allOpen        = unbuilt.every(r => !r.claimedBy);
    const enoughTrains   = carsNeeded <= player.trainsLeft;
    const nearlyDone     = remainingHops <= 2 && allOpen && enoughTrains;
    const score          = this._ticketScore(t, player);

    return { ticket: t, connected, nearlyDone, carsNeeded, enoughTrains, score };
  });

  const keep    = [];
  const discard = [];

  for (const e of evaluated) {
    if (e.connected || (e.nearlyDone && e.enoughTrains)) {
      keep.push(e.ticket);
    } else {
      discard.push(e.ticket);
    }
  }

  // Must keep at least 1 — keep the lowest-point discard if all would be discarded
  if (keep.length === 0) {
    evaluated.sort((a, b) => a.ticket.points - b.ticket.points);
    keep.push(evaluated[0].ticket);
    discard.push(...evaluated.slice(1).map(e => e.ticket));
  }

  this.discardTickets(player.id, discard.map(t => t.id));
}

// ── Build plan ────────────────────────────────────────────────────────────────
_buildPlan(player, unconnected, handCounts) {
  const neededColors = {};
  const candidates   = [];

  for (const ticket of unconnected) {
    const path = this._shortestPath(ticket.from, ticket.to, player);
    if (!path) continue;

    // Unbuilt routes in this path, ordered intelligently
    const unbuilt = path.filter(r => !r.claimedBy);
    const ordered = this._orderBuildSequence(unbuilt, player);

    for (const r of ordered) {
      // Track needed colors for card-picking decisions
      const colorKey = r.color === "gray" ? "_gray" : r.color;
      neededColors[colorKey] = (neededColors[colorKey] || 0) + r.length;
      if (r.color !== "gray") {
        neededColors[r.color] = (neededColors[r.color] || 0) + r.length;
      }

      // Try to build without using loco as substitute (save locos)
      const canBuild = this._canBuildRoute(r, player, handCounts, false);
      if (canBuild) {
        candidates.push({
          route:      r,
          cardsToUse: canBuild,
          priority:   this._routePriority(r, player, unconnected),
        });
      }
    }
  }

  // Danger route check — build preemptively if opponent is adjacent
  const danger = this._findDangerRoute(player, unconnected, handCounts);
  if (danger) {
    candidates.push(danger);
  }

  if (candidates.length === 0) {
    return { route: null, cardsToUse: null, neededColors };
  }

  candidates.sort((a, b) => b.priority - a.priority);
  const best = candidates[0];
  return { route: best.route, cardsToUse: best.cardsToUse, neededColors };
}

// Order unbuilt routes: start building from the end closest to existing network
_orderBuildSequence(unbuiltRoutes, player) {
  if (unbuiltRoutes.length <= 1) return unbuiltRoutes;

  const myCities = new Set();
  player.claimedRoutes.forEach(r => { myCities.add(r.from); myCities.add(r.to); });

  return [...unbuiltRoutes].sort((a, b) => {
    const aAdj = (myCities.has(a.from) ? 1 : 0) + (myCities.has(a.to) ? 1 : 0);
    const bAdj = (myCities.has(b.from) ? 1 : 0) + (myCities.has(b.to) ? 1 : 0);
    if (bAdj !== aAdj) return bAdj - aAdj;
    return a.length - b.length; // prefer shorter routes first
  });
}

// Priority score for building a route (higher = build sooner)
_routePriority(route, player, unconnected) {
  let priority = 0;

  // Highest priority: this route completes a ticket connection
  for (const t of unconnected) {
    const hypothetical = [...player.claimedRoutes, route];
    if (isConnected(hypothetical, t.from, t.to)) {
      priority += t.points * 10;
    }
  }

  // Prefer shorter routes (less resource risk)
  priority += (8 - route.length) * 3;

  // Prefer colored routes over gray (gray is flexible, less urgent to claim)
  if (route.color !== "gray") priority += 4;

  return priority;
}

// Check if bot can build a route right now; returns cardsToUse or null
_canBuildRoute(route, player, handCounts, allowLocoSub) {
  if (route.claimedBy)              return null;
  if (route.length > player.trainsLeft) return null;

  // Dual group: can't claim both lanes
  if (route.dualGroup) {
    const sibling = this.routes.find(
      r => r.dualGroup === route.dualGroup && r.id !== route.id
    );
    if (sibling?.claimedBy === player.id) return null;
  }

  const locos    = handCounts["locomotive"] || 0;
  const locoReq  = route.ferry ? (route.locosRequired || 0) : 0;
  const needed   = route.length;

  if (locos < locoReq) return null; // can't meet ferry requirement

  const nonLocoNeeded = needed - locoReq;

  if (route.color === "gray") {
    // Gray = any single color (all same) + optional loco substitutes
    // Pick the color we have the MOST of (greedy = less waste)
    const colorOptions = Object.keys(handCounts)
      .filter(c => c !== "locomotive" && handCounts[c] > 0)
      .sort((a, b) => handCounts[b] - handCounts[a]); // most abundant first

    for (const color of colorOptions) {
      const have     = handCounts[color];
      const colorUse = Math.min(have, nonLocoNeeded); // use as many as possible
      const locoFill = nonLocoNeeded - colorUse;      // fill gap with locos

      if (locoFill > 0 && !allowLocoSub) continue;   // don't use locos unless allowed
      const totalLocos = locoFill + locoReq;
      if (totalLocos > locos) continue;               // not enough locos

      const cards = [];
      if (colorUse > 0)   cards.push({ color, count: colorUse });
      if (totalLocos > 0) cards.push({ color: "locomotive", count: totalLocos });
      return cards; // return first valid (= most-abundant color)
    }

    // Pure locomotive fallback (only if allowed and have enough)
    if (allowLocoSub && locos >= needed) {
      return [{ color: "locomotive", count: needed }];
    }
    return null;
  } else {
    // Fixed-color route
    const have     = handCounts[route.color] || 0;
    const colorUse = Math.min(have, nonLocoNeeded);
    const locoFill = nonLocoNeeded - colorUse;

    if (locoFill > 0 && !allowLocoSub) return null;
    const totalLocos = locoFill + locoReq;
    if (totalLocos > locos) return null;

    const cards = [];
    if (colorUse > 0)    cards.push({ color: route.color, count: colorUse });
    if (totalLocos > 0)  cards.push({ color: "locomotive", count: totalLocos });
    return cards;
  }
}

// Danger: another player is adjacent to a route we need — build it preemptively
_findDangerRoute(player, unconnected, handCounts) {
  const neededIds = new Set();
  for (const ticket of unconnected) {
    const path = this._shortestPath(ticket.from, ticket.to, player);
    if (path) path.forEach(r => { if (!r.claimedBy) neededIds.add(r.id); });
  }

  const otherCities = new Set();
  this.players.forEach(p => {
    if (p.id === player.id) return;
    p.claimedRoutes.forEach(r => { otherCities.add(r.from); otherCities.add(r.to); });
  });

  for (const rid of neededIds) {
    const r = this.routes.find(rt => rt.id === rid);
    if (!r || r.claimedBy) continue;

    const isDanger = otherCities.has(r.from) || otherCities.has(r.to);
    if (!isDanger) continue;

    // In danger: allow loco substitution
    const canBuild = this._canBuildRoute(r, player, handCounts, true);
    if (canBuild) {
      return {
        route:      r,
        cardsToUse: canBuild,
        priority:   99999, // emergency — override everything
      };
    }
  }
  return null;
}

// ── Face-up card picking ──────────────────────────────────────────────────────
// Rules: take exactly 2 non-loco cards  OR  exactly 1 locomotive card
_pickFaceUpCards(player, neededColors, handCounts, unconnected) {
  const faceUp = this.faceUpCards;
  if (!faceUp || faceUp.length === 0) return null;

  const locos = handCounts["locomotive"] || 0;

  // Detect extreme danger: only 1 unclaimed route left for a ticket
  // AND we don't have the right color cards
  const inExtremeDanger = unconnected.some(t => {
    const path = this._shortestPath(t.from, t.to, player);
    if (!path) return false;
    const unbuilt = path.filter(r => !r.claimedBy);
    if (unbuilt.length !== 1) return false;
    const r = unbuilt[0];
    if (r.color === "gray") return false;
    const have = handCounts[r.color] || 0;
    return have < r.length && locos < (r.length - have);
  });

  // Separate loco and non-loco face-up cards (with their indices)
  const locoEntries    = faceUp.map((c, i) => ({ c, i })).filter(e => e.c.color === "locomotive");
  const nonLocoEntries = faceUp.map((c, i) => ({ c, i })).filter(e => e.c.color !== "locomotive");

  // Take 1 locomotive ONLY in extreme danger and we have fewer than 2 locos
  if (inExtremeDanger && locoEntries.length > 0 && locos < 2) {
    return [locoEntries[0].i]; // single loco — valid 1-card take
  }

  if (nonLocoEntries.length === 0) return null;

  // Score each non-loco card by how much we need that color
  const scored = nonLocoEntries
    .map(e => ({
      ...e,
      need: neededColors[e.c.color] || 0,
    }))
    .sort((a, b) => b.need - a.need);

  // Nothing useful in face-up
  if (scored[0].need === 0) return null;

  // We need exactly 2 non-loco cards
  if (scored.length >= 2) {
    // Best case: 2 needed cards
    if (scored[1].need > 0) {
      return [scored[0].i, scored[1].i];
    }
    // 1 needed + 1 any non-loco (avoid taking loco as second card)
    const secondBest = scored.find(e => e.i !== scored[0].i);
    if (secondBest) return [scored[0].i, secondBest.i];
  }

  // Only 1 non-loco in face-up — can't take a single non-loco by rules,
  // so fall through to deck draw
  return null;
}

// ── BFS shortest path ─────────────────────────────────────────────────────────
// Returns array of Route objects from `from` to `to` using available routes,
// or null if no path exists.
_shortestPath(from, to, player) {
  if (from === to) return [];

  const available = this.routes.filter(
    r => !r.claimedBy || r.claimedBy === player.id
  );

  const adj = {};
  available.forEach(r => {
    if (!adj[r.from]) adj[r.from] = [];
    if (!adj[r.to])   adj[r.to]   = [];
    adj[r.from].push({ city: r.to,   route: r });
    adj[r.to].push({   city: r.from, route: r });
  });

  const queue   = [{ city: from, path: [] }];
  const visited = new Set([from]);

  while (queue.length) {
    const { city, path } = queue.shift();
    for (const { city: next, route } of (adj[city] || [])) {
      if (visited.has(next)) continue;
      const newPath = [...path, route];
      if (next === to) return newPath;
      visited.add(next);
      queue.push({ city: next, path: newPath });
    }
  }
  return null; // no path available
}

// ── Utility ───────────────────────────────────────────────────────────────────
_countCards(hand) {
  const counts = {};
  hand.forEach(c => { counts[c.color] = (counts[c.color] || 0) + 1; });
  return counts;
}

  replacePlayerWithBot(oldUsername, botName) {
    const player = this.players.find((p) => p.id === oldUsername);
    if (!player) return;

    player.id = botName;
    player.isBot = true;

    this.setMessage(`${oldUsername} was replaced by BOT ${botName}`);
    this.broadcastState();
  }

  // ── Snapshot ──────────────────────────────────────────────────────────────
  snapshot() {
    return {
      map:     "India 1911",
      phase:   this.phase,
      initialSelectionSecondsLeft: this.initialSelectionSecondsLeft,
      players: this.players.map((p) => ({
        id:                   p.id,
        trainColor:           p.trainColor,
        hand:                 p.hand,
        handCount:            p.hand.length,
        tickets:              p.tickets,
        pendingTickets:       p.pendingTickets,
        claimedRouteIds:      p.claimedRoutes.map((r) => r.id),
        score:                p.score,
        trainsLeft:           p.trainsLeft,
        initialSelectionDone: p.initialSelectionDone,
        ticketResults:        p.ticketResults,
      })),
      currentTurn:        this.phase === "initial_selection" ? null : (this.players[this.turn]?.id || null),
      deckCount:          this.deck.length,
      discardCount:       this.discard.length,
      ticketDeckCount:    this.ticketDeck.length,
      ticketDiscardCount: this.ticketDiscard.length,
      faceUpCards:        this.faceUpCards,
      routes:             this.routes,   // full route objects including claimedBy + trainColor
      finalRound:         this.finalRound,
      lastRoundCalledBy:  this.lastRoundCalledBy,
      finalScores:        this.finalScores,
      message:            this.lastMessage,
    };
  }

  broadcastState() {
     this.emit("ticketToRide_state", this.snapshot());
     if (this.players[this.turn]?.isBot) {
        this.PlayBotTurn();
    }
  }
}

module.exports = TicketToRideEngine;