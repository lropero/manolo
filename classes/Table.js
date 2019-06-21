const Dealer = require('./Dealer')
const Pot = require('./Pot')

class Table {
  constructor ({ id, players, tournament }) {
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

  reset ({ buck }) {
    this.buck = buck
    this.pot = new Pot()
    // this.players.discardCards()
  }
}

module.exports = Table
