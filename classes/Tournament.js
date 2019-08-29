const arrayShuffle = require('array-shuffle')
const gradient = require('gradient-string')
const { chunk } = require('lodash')

const Player = require('./Player')
const Table = require('./Table')
const { isValidPlayerName } = require('../utils')

class Tournament {
  constructor ({ config, logger, players }) {
    this.config = config
    this.handCount = 0
    this.handCountPerLevel = 0
    this.level = 0
    this.logger = logger
    this.playersWaitingTable = []
    this.tables = []
    this.seatPlayers({ players })
  }

  static initialize ({ config = {}, logger = () => {}, playerNames = [] } = {}) {
    return new Promise((resolve, reject) => {
      try {
        const { levels, playersPerTable = 0, startingChips = 0 } = config
        if (!Array.isArray(levels) || !(levels[0].length >= 3) || !(levels[0][1] > 0) || !(levels[0][2] > 0)) {
          throw new Error('Tournament requires config.levels to be properly configured')
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
          if (!isValidPlayerName({ playerName })) {
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

  getAnteAndBlinds () {
    const { levels } = this.config
    return {
      ante: levels[this.level][0],
      blinds: [levels[this.level][1], levels[this.level][2]]
    }
  }

  getHandId () {
    return ++this.handCount
  }

  async play () {
    const eliminated = []
    let pause = false
    while (!pause && (this.tables.length > 1 || this.tables[0].players.length > 1)) {
      this.handCountPerLevel++
      if (this.handCountPerLevel === this.config.levels.slice(0, this.level + 1).reduce((limit, level) => limit + level[3], 0)) {
        this.handCountPerLevel = 0
        this.level++
      }
      let pausing = false
      for (const table of this.tables) {
        await table.dealer.playHand()
        eliminated.push(...table.players.filter((player) => player.isBroke()).map((player) => [table.id, player.name]))
        if (eliminated.length) {
          pausing = true
        }
      }
      pause = pausing
    }
    if (pause) {
      for (const [tableId, playerName] of eliminated) {
        this.tables.find((table) => table.id === tableId).removePlayer({ playerName })
      }
      await this.reaccommodateTables()
      const winner = await this.play()
      return winner
    }
    return this.tables[0].players[0]
  }

  async reaccommodateTables () {
    if (this.tables.length > 1) {
      for (const tableWithOnePlayer of this.tables.filter((table) => table.players.length === 1)) {
        this.playersWaitingTable.push(tableWithOnePlayer.players[0])
        this.tables = this.tables.filter((table) => table.id !== tableWithOnePlayer.id)
      }
      let freeSeats = (this.tables.length * this.config.playersPerTable) - [].concat(...this.tables.map((table) => table.players), this.playersWaitingTable).length
      while (freeSeats > this.config.playersPerTable && this.tables.length > 1) {
        const smallestTable = this.tables.reduce((smallestTable, table) => {
          if (table.players.length <= smallestTable.players.length) {
            return table
          }
          return smallestTable
        })
        for (const player of smallestTable.players.concat(this.playersWaitingTable)) {
          const restOfTablesWithOpenSeats = this.tables.filter((table) => table.id !== smallestTable.id && table.players.length < this.config.playersPerTable)
          const table = restOfTablesWithOpenSeats[Math.floor(Math.random() * restOfTablesWithOpenSeats.length)]
          if (table) {
            table.addPlayer({ player })
          } else if (!this.playersWaitingTable.find((p) => p.name === player.name)) {
            this.playersWaitingTable.push(player)
          }
        }
        this.tables = this.tables.filter((table) => table.id !== smallestTable.id)
        const seated = [].concat(...this.tables.map((table) => table.players)).map((player) => player.name)
        this.playersWaitingTable = this.playersWaitingTable.filter((player) => !seated.includes(player.name))
        freeSeats = (this.tables.length * this.config.playersPerTable) - [].concat(...this.tables.map((table) => table.players), this.playersWaitingTable).length
      }
    }
    if (this.playersWaitingTable.length) {
      let tableWithFreeSeat = this.tables.find((table) => table.players.length < this.config.playersPerTable)
      while (tableWithFreeSeat && this.playersWaitingTable.length) {
        tableWithFreeSeat.addPlayer({ player: this.playersWaitingTable.pop() })
        tableWithFreeSeat = this.tables.find((table) => table.players.length < this.config.playersPerTable)
      }
      if (this.playersWaitingTable.length > Math.floor(this.config.playersPerTable / 2)) {
        this.seatPlayers({ players: this.playersWaitingTable })
      }
    }
  }

  async run () {
    const winner = await this.play()
    console.log(gradient.rainbow(`Winner is ${winner.name} with ${winner.stack} chips`))
  }

  seatPlayers ({ players }) {
    let groups = chunk(arrayShuffle(players), this.config.playersPerTable)
    if (groups[groups.length - 1].length <= Math.floor(this.config.playersPerTable / 2) && groups[groups.length - 2]) {
      const temp = groups[groups.length - 2].concat(groups[groups.length - 1])
      const half = Math.ceil(temp.length / 2)
      const temp1 = temp.slice(0, half)
      const temp2 = temp.slice(half)
      if (temp2.length === 1) {
        if (!this.playersWaitingTable.find((player) => player.name === temp2[0].name)) {
          this.playersWaitingTable.push(temp2[0])
        }
        groups = groups.slice(0, groups.length - 2).concat([temp1])
      } else {
        groups = groups.slice(0, groups.length - 2).concat([temp1], [temp2])
      }
    }
    for (const group of groups) {
      this.tables.push(new Table({ id: ((this.tables[this.tables.length - 1] && this.tables[this.tables.length - 1].id) || 0) + 1, players: group, tournament: this }))
      this.playersWaitingTable = this.playersWaitingTable.filter((player) => !group.includes(player))
    }
  }
}

module.exports = Tournament
