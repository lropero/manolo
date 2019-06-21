class Player {
  constructor ({ chips, name }) {
    this.cards = []
    this.name = name
    this.stack = chips
  }

  decide () {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        console.log('decide')
        return resolve()
      }, 300)
    })
  }

  pay ({ amount }) {
    if (this.stack - amount >= 0) {
      this.stack -= amount
      return amount
    } else {
      this.stack = 0
      return this.stack
    }
  }

  receiveCard ({ card }) {
    this.cards.push(card)
  }

  setTable ({ table }) {
    this.table = table
  }

  showCards () {
    return this.cards.reduce((string, card) => string + card.reveal(), '')
  }
}

module.exports = Player
