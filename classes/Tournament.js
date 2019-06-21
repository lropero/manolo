const arrayShuffle = require('array-shuffle')
const { Subject } = require('rxjs')
const { chunk } = require('lodash')

const Player = require('./Player')
const Table = require('./Table')
const { isValidPlayerName } = require('../utils')

class Tournament {
  constructor ({ config, logger, players }) {
    this.ante = config.ante || 0
    this.blinds = config.blinds
    this.handCount = 0
    this.logger = logger
    this.messageBus = new Subject()
    this.playersWaitingTable = []
    this.seatPlayers({ players, playersPerTable: config.playersPerTable })
  }

  static initialize ({ config = {}, logger = () => {}, playerNames = [] } = {}) {
    return new Promise((resolve, reject) => {
      try {
        const { blinds, playersPerTable = 0, startingChips = 0 } = config
        if (!Array.isArray(blinds) || !(blinds.length === 2) || !(blinds[0] > 0) || !(blinds[1] > 0)) {
          throw new Error('Tournament requires config.blinds to be an array of 2 numbers greater than 0')
        }
        if (playersPerTable < 2 || playersPerTable > 9) {
          throw new Error('Tournament requires config.playersPerTable to be between 2 and 9')
        }
        if (!(startingChips > 0)) {
          throw new Error('Tournament requires config.startingChips to be greater than 0')
        }
        if (typeof logger !== 'function') {
          throw new Error('Tournament requires logger function')
        }
        if (playerNames.length < 2) {
          throw new Error('Tournament requires a minimum of 2 players')
        }
        for (const [index, playerName] of playerNames.entries()) {
          if (!isValidPlayerName(playerName)) {
            throw new Error(`Player ${index + 1} (${playerName}) has invalid player name`)
          }
          if (playerNames.reduce((count, name) => count + (name === playerName), 0) > 1) {
            throw new Error(`Player ${index + 1} (${playerName}) is repeated`)
          }
        }
        const players = playerNames.map((playerName) => new Player({ chips: startingChips, name: playerName }))
        const tournament = new Tournament({ config, logger, players })
        return resolve(tournament)
      } catch (error) {
        return reject(error)
      }
    })
  }

  getHandId () {
    return ++this.handCount
  }

  run () {
    this.messageBus.next('play')
  }

  seatPlayers ({ players, playersPerTable }) {
    let groups = chunk(arrayShuffle(players), playersPerTable)
    if (groups[groups.length - 1].length <= Math.floor(playersPerTable / 2)) {
      const temp = groups[groups.length - 2].concat(groups[groups.length - 1][0])
      const half = Math.ceil(temp.length / 2)
      const temp1 = temp.slice(0, half)
      const temp2 = temp.slice(half)
      if (temp2.length === 1) {
        this.playersWaitingTable.push(temp2[0])
        groups = groups.slice(0, groups.length - 2).concat([temp1])
      } else {
        groups = groups.slice(0, groups.length - 2).concat([temp1], [temp2])
      }
    }
    this.tables = groups.map((group, index) => new Table({ id: index + 1, players: group, tournament: this }))
  }
}

module.exports = Tournament
