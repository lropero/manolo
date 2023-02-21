import arrayShuffle from 'array-shuffle'

import Card from './card.js'

class Deck {
  constructor () {
    this.shuffle()
  }

  deal (howMany = 1) {
    const cards = []
    for (let i = 0; i < howMany; i++) {
      if (!this.cards.length) {
        throw new Error('No more cards')
      }
      cards.push(this.cards.shift())
    }
    return cards
  }

  shuffle () {
    const cards = []
    for (let suit = 0; suit < 4; suit++) {
      for (let rank = 0; rank <= 12; rank++) {
        cards.push(new Card(rank, suit))
      }
    }
    this.cards = arrayShuffle(cards)
  }
}

export default Deck
