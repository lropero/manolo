const arrayShuffle = require('array-shuffle')

const Card = require('./Card')

class Deck {
  constructor () {
    this.shuffle()
  }

  deal (howMany = 1) {
    return new Promise((resolve, reject) => {
      const cards = []
      for (let i = 0; i < howMany; i++) {
        if (!this.cards.length) {
          return reject(new Error('No more cards'))
        }
        cards.push(this.cards.shift())
      }
      return resolve(cards)
    })
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

module.exports = Deck
