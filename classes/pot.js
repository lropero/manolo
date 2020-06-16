class Pot {
  constructor () {
    this.pots = {}
    this.puts = {}
  }

  addChips ({ chips, playerName }) {
    if (!this.puts[playerName]) {
      this.puts[playerName] = []
    }
    this.puts[playerName].push(chips)
  }

  collect ({ winners }) {
    const keys = Object.keys(this.pots)
    return winners.reduce((collected, playerNames, index) => {
      const chips = Object.values(this.pots[keys[index]]).reduce(
        (sum, value) => sum + value,
        0
      )
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
    return Object.values(this.pots).reduce(
      (chips, pot) =>
        chips + Object.values(pot).reduce((sum, value) => sum + value, 0),
      0
    )
  }

  getCommitted ({ playerName }) {
    return (this.puts[playerName] || []).reduce(
      (committed, put) => committed + put,
      0
    )
  }

  getLast ({ player }) {
    const puts = this.puts[player.name] || []
    return puts.length && puts[puts.length - 1]
  }

  getPlayerNamesPerPot () {
    return Object.keys(this.pots).reduce((playerNamesPerPot, key) => {
      playerNamesPerPot.push(JSON.parse(key))
      return playerNamesPerPot
    }, [])
  }

  isSettled () {
    return !Object.keys(this.puts).length
  }

  normalize ({ activePlayerNames }) {
    if (!this.isSettled()) {
      let currentPot = Object.keys(this.puts).reduce((pot, playerName) => {
        pot[playerName] = this.getCommitted({ playerName })
        return pot
      }, {})
      let sidePot = null
      const playerNamesInCurrentPot = Object.keys(currentPot)
      const playerNames = activePlayerNames
        .sort()
        .filter(playerName => playerNamesInCurrentPot.includes(playerName))
      // Check if side pot required
      const bets = Object.values(
        playerNames.reduce((pot, playerName) => {
          if (currentPot[playerName]) {
            pot[playerName] = currentPot[playerName]
          }
          return pot
        }, {})
      )
      const min = Math.min(...bets)
      if (Math.max(...bets) !== min) {
        // Side pot required
        const newCurrentPot = playerNamesInCurrentPot.reduce(
          (pot, playerName) => {
            pot[playerName] =
              currentPot[playerName] < min ? currentPot[playerName] : min
            return pot
          },
          {}
        )
        const newSidePot = playerNamesInCurrentPot.reduce((pot, playerName) => {
          const newBet = currentPot[playerName] - newCurrentPot[playerName]
          if (newBet > 0) {
            pot[playerName] = newBet
          }
          return pot
        }, {})
        currentPot = newCurrentPot
        sidePot = newSidePot
      }
      for (const pot of [currentPot, sidePot]) {
        if (pot) {
          const playerNamesInPot = Object.keys(pot)
          const playerNames = activePlayerNames
            .sort()
            .filter(playerName => playerNamesInPot.includes(playerName))
          const key = JSON.stringify(playerNames)
          const keys = Object.keys(this.pots)
          if (!keys.length) {
            this.pots[key] = pot
          } else {
            const playerNamesInPreviousKey = JSON.parse(keys[keys.length - 1])
            if (
              key ===
              JSON.stringify(
                activePlayerNames
                  .sort()
                  .filter(playerName =>
                    playerNamesInPreviousKey.includes(playerName)
                  )
              )
            ) {
              // Merge current and previous pots together
              const previousPot = this.pots[keys[keys.length - 1]]
              delete this.pots[keys[keys.length - 1]]
              this.pots[key] = [
                ...playerNamesInPot,
                ...Object.keys(previousPot)
              ].reduce((mergedPot, playerName) => {
                if (!mergedPot[playerName]) {
                  mergedPot[playerName] =
                    (pot[playerName] || 0) + (previousPot[playerName] || 0)
                }
                return mergedPot
              }, {})
            } else {
              // Current pot has active player/s without bets (all-in from previous pots)
              this.pots[key] = pot
            }
          }
        }
      }
      this.puts = {}
    }
  }
}

module.exports = Pot
