class Pot {
  constructor () {
    this.pots = []
    this.puts = {}
  }

  addChips ({ chips, player }) {
    if (!this.puts[player.name]) {
      this.puts[player.name] = []
    }
    this.puts[player.name].push(chips)
  }

  collect () {
    return this.pots.reduce((chips, pot) => chips + Object.values(pot).reduce((sum, value) => sum + value, 0), 0)
  }

  getCommitted ({ player }) {
    return (this.puts[player.name] || []).reduce((committed, put) => committed + put, 0)
  }

  getLast ({ player }) {
    const puts = this.puts[player.name] || []
    return puts.length && puts[puts.length - 1]
  }

  isSettled () {
    return !Object.keys(this.puts).length
  }

  normalize ({ activePlayers }) {
    if (!this.isSettled()) {
      this.pots.push(Object.keys(this.puts).reduce((pot, playerName) => {
        pot[playerName] = this.getCommitted({ player: { name: playerName } })
        return pot
      }, {}))
      const bets = Object.values(activePlayers.map((player) => player.name).reduce((pot, playerName) => {
        pot[playerName] = this.pots[this.pots.length - 1][playerName]
        return pot
      }, {}))
      if (Math.max(...bets) !== Math.min(...bets)) {
        // TODO: side pot
        // console.log(this.pots)
        // console.log(bets)
        // process.exit(0)
      }
      this.puts = {}
    }
  }
}

module.exports = Pot
