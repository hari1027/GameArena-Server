const { CARD_CONFIG } = require("./cards");

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function buildDeck() {
  const deck = [];

  CARD_CONFIG.suits.forEach((suit) => {
    CARD_CONFIG.ranks.forEach((rank) => {
      deck.push({ suit, rank });
    });
  });

  return shuffle(deck);
}

module.exports = { buildDeck };