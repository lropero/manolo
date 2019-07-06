class Player {
  constructor ({ chips, name }) {
    this.cards = []
    this.name = name
    this.stack = chips
  }

  decide ({ committed, currentBet }) {
    return new Promise((resolve, reject) => {
      const amount = currentBet - committed
      let options = [1, 3, 4]
      if (amount === 0) {
        options = [2, 4]
      } else if (this.stack + committed <= currentBet) {
        options = [1, 3]
      }
      const random = options[Math.floor(Math.random() * options.length)]
      switch (random) {
        case 1: return resolve(`call ${this.pay({ amount })}`)
        case 2: return resolve('check')
        case 3: return resolve('fold')
        case 4: return resolve(`raise ${this.pay({ amount: (currentBet * 2) - committed })}`)
      }
    })
  }

  pay ({ amount }) {
    let chips = amount
    if (this.stack - chips < 0) {
      chips = this.stack
    }
    this.stack -= chips
    if (this.stack === 0) {
      this.isAllIn = true
    }
    return chips
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
