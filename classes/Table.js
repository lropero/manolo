const Dealer = require('./Dealer')
const Pot = require('./Pot')

class Table {
  constructor ({ id, players, tournament }) {
    this.cards = []
    this.dealer = new Dealer({ table: this, tournament })
    this.id = id
    this.players = players.map(player => {
      player.setTable({ table: this })
      return player
    })
  }

  addPlayer ({ player }) {
    player.setTable({ table: this })
    this.players.push(player)
  }

  receiveCards ({ cards }) {
    this.cards.push(...cards)
  }

  removePlayer ({ playerName }) {
    this.players = this.players.filter(player => player.name !== playerName)
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
