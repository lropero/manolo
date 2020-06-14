const chalk = require('chalk')

class Card {
  constructor (rank, suit) {
    this.rank = rank
    this.suit = suit
  }

  getColor () {
    switch (this.suit) {
      case 0:
        return 'gray'
      case 1:
        return 'green'
      case 2:
        return 'red'
      case 3:
        return 'blue'
    }
  }

  getRank () {
    switch (this.rank) {
      case 0:
        return 'A'
      case 9:
        return 'T'
      case 10:
        return 'J'
      case 11:
        return 'Q'
      case 12:
        return 'K'
      default:
        return this.rank + 1
    }
  }

  getSuit () {
    switch (this.suit) {
      case 0:
        return '\u2660'
      case 1:
        return '\u2663'
      case 2:
        return '\u2665'
      case 3:
        return '\u2666'
    }
  }

  reveal () {
    return chalk[this.getColor()](`${this.getRank()}${this.getSuit()}`)
  }
}

module.exports = Card
