const { CARD_CONFIG } = require("./cards");

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function buildSingleDeck() {
  const deck = [];

  CARD_CONFIG.suits.forEach((suit) => {
    CARD_CONFIG.ranks.forEach((rank) => {
      deck.push({ suit, rank });
    });
  });

  for (let i = 0; i < CARD_CONFIG.jokers; i++) {
    deck.push({ suit:"joker", rank:"joker", joker: true });
  }

  return deck;
}

function buildDeck(playerCount) {
  let decks = 1;
  if (playerCount > 4 && playerCount <= 8) decks = 2;
  if (playerCount > 8) decks = 3;

  let full = [];
  for (let i = 0; i < decks; i++) {
    full.push(...buildSingleDeck());
  }

  return shuffle(full);
}

module.exports = { buildDeck, shuffle };
