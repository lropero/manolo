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

  addPlayer ({ player }) {
    player.setTable({ table: this })
    this.players.push(player)
  }

  addToPot ({ chips, player }) {
    const currentPot = 0
    this.pots[currentPot][player] = (this.pots[currentPot][player] || 0) + chips
  }

  assignDealer ({ tournament }) {
    this.dealer = new Dealer({ table: this, tournament })
  }

  break () {
    this.dealer.stop()
    delete this.dealer
    delete this.players
  }

  receiveCards ({ cards }) {
    this.cards.push(...cards)
  }

  removePlayer ({ playerName }) {
    this.players = this.players.filter((player) => player.name !== playerName)
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
