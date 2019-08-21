const arrayShuffle = require('array-shuffle')
const chalk = require('chalk')
const { Subject } = require('rxjs')
const { chunk } = require('lodash')
const { cross } = require('figures')

const Player = require('./Player')
const Table = require('./Table')
const { errorToString, isValidPlayerName } = require('../utils')

class Tournament {
  constructor ({ config, logger, players }) {
    this.config = config
    this.errors = new Subject()
    this.handCount = 0
    this.handCountPerTable = {}
    this.lastTableId = 0
    this.logger = logger
    this.messageBus = new Subject()
    this.playersWaitingTable = []
    this.tables = []
    this.seatPlayers({ players })
    this.errors.subscribe(this.handleError.bind(this))
    this.messageBus.subscribe(this.processMessage.bind(this))
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
    if (!this.level) {
      this.level = 1
    } else if (levels[this.level - 1][3] && levels[this.level]) {
      const values = Object.values(this.handCountPerTable)
      const average = values.reduce((sum, value) => sum + value, 0) / values.length
      if (average >= levels[this.level - 1][3]) {
        this.handCountPerTable = {}
        this.level++
      }
    }
    return {
      ante: levels[this.level - 1][0],
      blinds: [levels[this.level - 1][1], levels[this.level - 1][2]]
    }
  }

  getHandId ({ tableId }) {
    if (!this.handCountPerTable[tableId]) {
      this.handCountPerTable[tableId] = 0
    }
    this.handCountPerTable[tableId]++
    return ++this.handCount
  }

  handleError ({ error, tableId = 0 }) {
    this.logger(`${chalk.red(cross)} ${tableId ? 'Table ' + tableId + ' -> ' : ''}${errorToString({ error })}`)
    if (error.stack) {
      this.logger(chalk.yellow(error.stack))
    }
    process.exit(1) // ..there better be no errors! :)
  }

  pause ({ tableId }) {
    return new Promise((resolve, reject) => {
      const paused = [tableId]
      this.pausing = new Subject()
      this.subscription = this.pausing.subscribe((tableId) => {
        paused.push(tableId)
        if (paused.length === this.tables.length) {
          this.subscription.unsubscribe()
          delete this.pausing
          return resolve()
        }
      })
      this.messageBus.next({ message: 'pause' })
    })
  }

  async processMessage ({ message, payload }) {
    try {
      switch (message) {
        case 'eliminated': {
          const { pausing, players, tableId } = payload
          for (const player of players) {
            this.tables.find((table) => table.id === tableId).removePlayer({ playerName: player.name })
          }
          if (!pausing) {
            await this.reaccommodateTables({ tableId })
          }
          break
        }
        case 'paused': {
          const { tableId } = payload
          this.pausing.next(tableId)
          break
        }
      }
    } catch (error) {
      this.errors.next({ error })
    }
  }

  async reaccommodateTables ({ tableId }) {
    if (this.tables.length > 1) {
      await this.pause({ tableId })
      let freeSeats = (this.tables.length * this.config.playersPerTable) - [].concat(...this.tables.map((table) => table.players), this.playersWaitingTable).length
      while (freeSeats > this.config.playersPerTable && this.tables.length > 1) {
        const smallestTable = this.tables.reduce((smallestTable, table) => {
          if (table.players.length < smallestTable.players.length) {
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
        smallestTable.break()
        this.tables = this.tables.filter((table) => table.id !== smallestTable.id)
        const seated = [].concat(...this.tables.map((table) => table.players)).map((player) => player.name)
        this.playersWaitingTable = this.playersWaitingTable.filter((player) => !seated.includes(player.name))
        freeSeats = (this.tables.length * this.config.playersPerTable) - [].concat(...this.tables.map((table) => table.players), this.playersWaitingTable).length
      }
      const tablesWithOnePlayer = this.tables.filter((table) => table.players.length === 1)
      for (const tableWithOnePlayer of tablesWithOnePlayer) {
        this.playersWaitingTable.push(tableWithOnePlayer.players[0])
        tableWithOnePlayer.break()
        this.tables = this.tables.filter((table) => table.id !== tableWithOnePlayer.id)
      }
    }
    if (this.playersWaitingTable.length) {
      let tableWithFreeSeat = this.tables.find((table) => table.players.length < this.config.playersPerTable)
      while (tableWithFreeSeat && this.playersWaitingTable.length) {
        tableWithFreeSeat.addPlayer({ player: this.playersWaitingTable.pop() })
        tableWithFreeSeat = this.tables.find((table) => table.players.length < this.config.playersPerTable)
      }
      this.playersWaitingTable.length > Math.floor(this.config.playersPerTable / 2) && this.seatPlayers({ players: this.playersWaitingTable })
    }
    this.run()
  }

  run () {
    this.messageBus.next({ message: 'play' })
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
      this.tables.push(new Table({ id: ++this.lastTableId, players: group, tournament: this }))
      this.playersWaitingTable = this.playersWaitingTable.filter((player) => !group.includes(player))
    }
  }
}

module.exports = Tournament
