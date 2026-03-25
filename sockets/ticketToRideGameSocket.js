const { getTicketToRideGame } = require("../managers/ticketToRideGameManager");

/**
 * Socket event contract — Ticket to Ride (India)
 * ─────────────────────────────────────────────
 *
 * SERVER → CLIENT  (1 event)
 * ──────────────────────────
 *   ticket_game_state  (full snapshot — emitted on game start and after every action)
 *     payload: TicketGameSnapshot (see engine.snapshot())
 *
 * CLIENT → SERVER  (5 events)
 * ──────────────────────────
 *   1. ticket_discard_initial_tickets
 *        { roomId, playerId, discardIds: string[] }
 *        During initial_selection phase (100 s window).
 *        discardIds = ticket ids to THROW AWAY (0–2).
 *        The player keeps everything NOT in discardIds (min 2 kept).
 *        Send discardIds:[] to keep all 4.
 *
 *   2. ticket_take_cards
 *        { roomId, playerId, source: 'deck' | 'topPane', indices: number[] }
 *        source 'deck'    → draw 2 blind cards; indices ignored.
 *        source 'topPane' → indices.length === 1 : take 1 face-up card
 *                                                   (locomotive → full turn, UI enforces).
 *                           indices.length === 2 : take 2 face-up cards
 *                                                   (neither may be a locomotive).
 *
 *   3. ticket_take_ticket
 *        { roomId, playerId }
 *        Draw up to 3 destination tickets into pendingTickets.
 *        (If the active ticket deck < 3, the discard pile is shuffled in first.)
 *        Turn does NOT advance until ticket_keep_tickets is sent.
 *
 *   4. ticket_keep_tickets
 *        { roomId, playerId, discardIds: string[] }
 *        discardIds = ticket ids to DISCARD from the 3 drawn (0–2 ids; keep ≥ 1).
 *        Send discardIds:[] to keep all 3.
 *
 *   5. ticket_build_route
 *        { roomId, playerId, routeId: string, cardsToUse: [{ color, count }] }
 *        Total count must equal route.length.
 *        Gray route   → all non-locomotive cards same color.
 *        Color route  → all non-locomotive cards match route.color.
 *        Locomotive substitutes any missing color card.
 *
 *   6. ticket_call_last_round
 *        { roomId, playerId }
 *        Allowed when trainsLeft === 0 OR no remaining route fits trainsLeft.
 */

function registerTicketToRideGameSockets(io, socket) {
  // ── Room join ──────────────────────────────────────────────────────────────
  socket.on("join_room", ({ roomId }) => {
    socket.join(roomId);
  });

  // ── 1. Initial ticket discard (setup phase, 100 s window) ─────────────────
  // data: { roomId, playerId, discardIds: string[] }  — 0–2 ticket ids to throw away
  socket.on("ticket_discard_initial_tickets", (data) => {
    const { roomId, playerId, discardIds = [] } = data;
    const engine = getTicketToRideGame(roomId);
    if (!engine) return;
    engine.discardInitialTickets(playerId, discardIds);
  });

  // ── 2. Take cards move ────────────────────────────────────────────────────
  // data: { roomId, playerId, source: 'deck' | 'topPane', indices: number[] }
  socket.on("ticket_take_cards", (data) => {
    const { roomId, playerId, source, indices } = data;
    const engine = getTicketToRideGame(roomId);
    if (!engine) return;
    engine.takeCards(playerId, { source, indices });
  });

  // ── 3. Take destination tickets (step 1) ──────────────────────────────────
  // data: { roomId, playerId }
  // Draws up to 3 tickets into player.pendingTickets.
  // Turn does NOT advance until ticket_keep_tickets is sent.
  socket.on("ticket_take_ticket", (data) => {
    const { roomId, playerId } = data;
    const engine = getTicketToRideGame(roomId);
    if (!engine) return;
    engine.takeTickets(playerId);
  });

  // ── 4. Keep / discard destination tickets (step 2) ────────────────────────
  // data: { roomId, playerId, discardIds: string[] }  — 0–2 ticket ids to discard
  socket.on("ticket_keep_tickets", (data) => {
    const { roomId, playerId, discardIds = [] } = data;
    const engine = getTicketToRideGame(roomId);
    if (!engine) return;
    engine.discardTickets(playerId, discardIds);
  });

  // ── 5. Build route move ───────────────────────────────────────────────────
  // data: { roomId, playerId, routeId, cardsToUse: [{ color, count }] }
  socket.on("ticket_build_route", (data) => {
    const { roomId, playerId, routeId, cardsToUse } = data;
    const engine = getTicketToRideGame(roomId);
    if (!engine) return;
    engine.buildRoute(playerId, routeId, cardsToUse);
  });

  // ── 6. Call last round ────────────────────────────────────────────────────
  // data: { roomId, playerId }
  socket.on("ticket_call_last_round", (data) => {
    const { roomId, playerId } = data;
    const engine = getTicketToRideGame(roomId);
    if (!engine) return;
    engine.callLastRound(playerId);
  });
}

/**
 * Bind engine-level events to socket.io room broadcasts.
 * Call this once per game, right after the engine is created.
 *
 * The engine emits 'ticket_state' after every state change;
 * we forward it to all sockets in the room as 'ticket_game_state'.
 */
function bindTicketToRideEngineEvents(io, roomId, engine) {
  engine.on("ticketToRide_state", (snapshot) => {
    io.to(roomId).emit("ticketToRide_game_state", snapshot);
  });
}

module.exports = {
  registerTicketToRideGameSockets,
  bindTicketToRideEngineEvents,
};