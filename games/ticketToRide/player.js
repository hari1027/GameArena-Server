class TicketToRidePlayer {
  constructor(id) {
    this.id = id;
    this.hand = [];
    this.tickets = [];
    this.pendingTickets = [];
    this.claimedRoutes = [];   // array of full route objects (for BFS connectivity)
    this.score = 0;
    this.trainsLeft = 45;
    this.initialSelectionDone = false;
    this.ticketResults = null; // set at game end: [{...ticket, completed, delta}]
    this.trainColor = null;    // hex color assigned at game start, unique per player
    this.isBot = false;
  }
}

module.exports = TicketToRidePlayer;