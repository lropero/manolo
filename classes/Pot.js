class Pot {
  constructor () {
    this.pots = [{}]
  }

  addChips ({ chips, player }) {
    this.pots[this.pots.length - 1][player.name] = (this.pots[this.pots.length - 1][player.name] || 0) + chips
  }

  normalize () {
    const pot = this.pots[this.pots.length - 1]
    const bets = Object.values(pot)
    if (Math.max(...bets) !== Math.min(...bets)) {
      console.log('side pot')
      process.exit(0) // DELETE LINE
    }
  }
}

module.exports = Pot
