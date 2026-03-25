// 8 colors × 12 = 96 + 14 locomotives = 110 total cards
const COLORS = ["red", "blue", "green", "yellow", "black", "white", "pink", "orange"];

function buildDeck() {
  const deck = [];
  for (const color of COLORS) {
    for (let i = 0; i < 12; i++) {
      deck.push({ color });
    }
  }
  for (let i = 0; i < 14; i++) {
    deck.push({ color: "locomotive" });
  }
  return deck;
}

module.exports = { buildDeck, COLORS };
