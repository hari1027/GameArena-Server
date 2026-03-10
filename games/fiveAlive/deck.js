const { CARD_CONFIG } = require("./cards");

function shuffle(arr) {
  return arr.sort(() => Math.random() - 0.5);
}

function buildDeck() {
  const deck = [];

  Object.entries(CARD_CONFIG.numbers).forEach(([v, c]) => {
    for (let i = 0; i < c; i++) {
      deck.push({ type: "number", value: Number(v) });
    }
  });

  Object.entries(CARD_CONFIG.powers).forEach(([p, c]) => {
    for (let i = 0; i < c; i++) {
      deck.push({ type: "power", power: p });
    }
  });

  return shuffle(deck);
}

module.exports = buildDeck;
