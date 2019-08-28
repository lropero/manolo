class Pot {
  constructor () {
    this.pots = []
    this.puts = {}
  }

  addChips ({ chips, playerName }) {
    if (!this.puts[playerName]) {
      this.puts[playerName] = []
    }
    this.puts[playerName].push(chips)
  }

  collect ({ winners }) {
    return winners.reduce((collected, playerNames, index) => {
      const chips = Object.values(this.pots[index]).reduce((sum, value) => sum + value, 0)
      const each = Math.floor(chips / playerNames.length)
      let remainder = 0
      let winnerIndex
      if (each * playerNames.length !== chips) {
        remainder = chips - each * playerNames.length
        winnerIndex = Math.floor(Math.random() * playerNames.length)
      }
      for (const [index, playerName] of playerNames.entries()) {
        let amount = each
        if (remainder > 0 && index === winnerIndex) {
          amount += remainder
        }
        collected[playerName] = (collected[playerName] || 0) + amount
      }
      return collected
    }, {})
  }

  count () {
    return this.pots.reduce((chips, pot) => chips + Object.values(pot).reduce((sum, value) => sum + value, 0), 0)
  }

  getCommitted ({ player }) {
    return (this.puts[player.name] || []).reduce((committed, put) => committed + put, 0)
  }

  getLast ({ player }) {
    const puts = this.puts[player.name] || []
    return puts.length && puts[puts.length - 1]
  }

  getPlayerNamesPerPot () {
    return this.pots.reduce((playerNamesPerPot, pot) => {
      playerNamesPerPot.push(Object.keys(pot))
      return playerNamesPerPot
    }, [])
  }

  isSettled () {
    return !Object.keys(this.puts).length
  }

  normalize ({ activePlayerNames }) {
    if (!this.isSettled()) {
      const currentPot = Object.keys(this.puts).reduce((pot, playerName) => {
        pot[playerName] = this.getCommitted({ player: { name: playerName } })
        return pot
      }, {})
      this.pots.push(currentPot)
      const bets = Object.values(activePlayerNames.reduce((activePlayersPot, playerName) => {
        if (currentPot[playerName]) {
          activePlayersPot[playerName] = currentPot[playerName]
        }
        return activePlayersPot
      }, {}))
      const min = Math.min(...bets)
      if (Math.max(...bets) !== min) { // Sidepot required
        this.pots[this.pots.length - 1] = Object.keys(currentPot).reduce((newPot, playerName) => {
          newPot[playerName] = currentPot[playerName] < min ? currentPot[playerName] : min
          return newPot
        }, {})
        this.pots.push(Object.keys(currentPot).reduce((sidePot, playerName) => {
          const newBet = currentPot[playerName] - this.pots[this.pots.length - 1][playerName]
          if (newBet > 0) {
            sidePot[playerName] = newBet
          }
          return sidePot
        }, {}))
      }
      this.puts = {}
    }
  }
}

module.exports = Pot
