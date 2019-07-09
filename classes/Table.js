const Dealer = require('./Dealer')
const Pot = require('./Pot')

class Table {
  constructor ({ id, players, tournament }) {
    this.cards = []
    this.id = id
    this.players = players.map((player) => {
      player.setTable({ table: this })
      return player
    })
    this.assignDealer({ tournament })
  }

  addToPot ({ chips, player }) {
    const currentPot = 0
    this.pots[currentPot][player] = (this.pots[currentPot][player] || 0) + chips
  }

  assignDealer ({ tournament }) {
    this.dealer = new Dealer({ table: this, tournament })
  }

  hasPlayer ({ player }) {
    return !!this.players.find((p) => p.name === player.name)
  }

  receiveCards ({ cards }) {
    this.cards.push(...cards)
  }

  removePlayer ({ player }) {
    this.players = this.players.filter((p) => p.name !== player.name)
  }

  reset ({ buck }) {
    this.buck = buck
    this.cards = []
    this.pot = new Pot()
    for (const player of this.players) {
      player.reset()
    }
  }

  showCards () {
    return this.cards.reduce((string, card) => string + card.reveal(), '')
  }
}

module.exports = Table
