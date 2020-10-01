class Player {
  constructor ({ chips, name }) {
    this.name = name
    this.stack = chips
  }

  decide ({ activePlayers, currentBet = 0 }) {
    return new Promise((resolve, reject) => {
      const { pot } = this.table
      let amount
      let committed
      let options = [2, 4, 5]
      if (currentBet === 0) {
        options = [1, 3]
      } else {
        committed = pot.getCommitted({ playerName: this.name })
        amount = currentBet - committed
        if (amount === 0) {
          options = [3, 5]
        } else if (this.stack + committed <= currentBet || !activePlayers.filter(player => !player.isAllIn && player.name !== this.name).length) {
          options = [2, 4]
        }
      }
      const random = options[Math.floor(Math.random() * options.length)]
      switch (random) {
        case 1:
          return resolve(`bet ${this.pay({ amount: Math.round(pot.count() / 2) })}`)
        case 2:
          return resolve(`call ${this.pay({ amount })}`)
        case 3:
          return resolve('check')
        case 4:
          return resolve('fold')
        case 5:
          return resolve(`raise ${this.pay({ amount: currentBet * 2 - committed })}`)
      }
    })
  }

  isBroke () {
    return !this.stack
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

  receiveChips ({ chips }) {
    this.stack += chips
  }

  reset () {
    this.cards = []
    if (this.isAllIn) {
      delete this.isAllIn
    }
  }

  setTable ({ table }) {
    this.reset()
    this.table = table
  }

  showCards () {
    return this.cards.reduce((string, card) => string + card.reveal(), '')
  }
}

module.exports = Player
