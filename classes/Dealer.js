const chalk = require('chalk')
const gradient = require('gradient-string')
const { Hand } = require('pokersolver')
const { catchError, concatMap } = require('rxjs/operators')
const { empty, from, throwError } = require('rxjs')

const Deck = require('./Deck')
const { cardsToArray, errorToString, identifyTable } = require('../utils')

class Dealer {
  constructor ({ table, tournament }) {
    this.deck = new Deck()
    this.table = table
    this.tournament = tournament
    this.subscribe()
  }

  async bettingRound ({ currentBet = 0, lastTableId, logger, pot, skipLast = false, startAt = 0, tableId }) {
    if (currentBet === 0) {
      let playerRaised = false
      await this.ringActivePlayers({
        fn: async (player) => {
          const decision = await player.decide({ activePlayers: this.activePlayers })
          const split = decision.split(' ')
          const option = split[0]
          const chips = parseFloat(split[1])
          switch (option) {
            case 'bet': {
              pot.addChips({ chips, playerName: player.name })
              currentBet = pot.getCommitted({ player })
              logger(identifyTable({ lastTableId, tableId }) + chalk.magenta(`${player.name}: bets ${currentBet}${player.isAllIn ? ' and is all-in' : ''}`))
              playerRaised = true
              skipLast = true
              startAt = this.activePlayers.findIndex((p) => p.name === player.name) + 1
              startAt = startAt < this.activePlayers.length ? startAt : 0
              throw new Error('Break')
            }
            case 'check': {
              logger(identifyTable({ lastTableId, tableId }) + chalk.magenta(`${player.name}: checks`))
              break
            }
          }
        },
        skipAllIn: true,
        skipLast,
        startAt
      })
      if (playerRaised) {
        await this.bettingRound({ currentBet, lastTableId, logger, pot, skipLast, startAt, tableId })
      } else {
        pot.normalize({ activePlayerNames: this.activePlayers.map((player) => player.name) })
      }
    }
    while (!pot.isSettled()) {
      let playerRaised = false
      await this.ringActivePlayers({
        fn: async (player) => {
          const decision = await player.decide({ activePlayers: this.activePlayers, currentBet })
          const split = decision.split(' ')
          const option = split[0]
          const chips = parseFloat(split[1])
          switch (option) {
            case 'call': {
              pot.addChips({ chips, playerName: player.name })
              logger(identifyTable({ lastTableId, tableId }) + chalk.magenta(`${player.name}: calls ${chips}${player.isAllIn ? ' and is all-in' : ''}`))
              if (this.activePlayers.filter((player) => !player.isAllIn).length === 1) {
                throw new Error('Break')
              }
              break
            }
            case 'check': {
              logger(identifyTable({ lastTableId, tableId }) + chalk.magenta(`${player.name}: checks`))
              break
            }
            case 'fold': {
              logger(identifyTable({ lastTableId, tableId }) + chalk.magenta(`${player.name}: folds`))
              this.activePlayers = this.activePlayers.filter((p) => p.name !== player.name)
              if (this.activePlayers.length === 1) {
                throw new Error('Break')
              } else if (this.activePlayers.filter((player) => !player.isAllIn).length === 1) {
                const maxBetFromAllInPlayers = this.activePlayers.filter((player) => player.isAllIn).reduce((maxBetFromAllInPlayers, player) => {
                  const committed = pot.getCommitted({ player })
                  return committed > maxBetFromAllInPlayers ? committed : maxBetFromAllInPlayers
                }, 0)
                const remainingPlayer = this.activePlayers.find((player) => !player.isAllIn)
                if (pot.getCommitted({ player: remainingPlayer }) >= maxBetFromAllInPlayers) {
                  throw new Error('Break')
                }
              }
              break
            }
            case 'raise': {
              pot.addChips({ chips, playerName: player.name })
              currentBet = pot.getCommitted({ player })
              logger(identifyTable({ lastTableId, tableId }) + chalk.magenta(`${player.name}: raises to ${currentBet}${player.isAllIn ? ' and is all-in' : ''}`))
              playerRaised = true
              skipLast = true
              startAt = this.activePlayers.findIndex((p) => p.name === player.name) + 1
              startAt = startAt < this.activePlayers.length ? startAt : 0
              throw new Error('Break')
            }
          }
        },
        skipAllIn: true,
        skipLast,
        startAt
      })
      !playerRaised && pot.normalize({ activePlayerNames: this.activePlayers.map((player) => player.name) })
    }
  }

  async dealCards (howMany = 2) {
    this.deck.shuffle()
    for (let i = 0; i < howMany; i++) {
      await this.ringActivePlayers({
        fn: async (player) => {
          const [card] = await this.deck.deal()
          player.receiveCard({ card })
        }
      })
    }
  }

  getPositions () {
    const { buck, players } = this.table
    const isHeadsUp = players.length === 2
    return {
      bigBlind: isHeadsUp ? 1 - buck : buck + 2 - (buck + 2 >= players.length && players.length),
      button: buck,
      smallBlind: isHeadsUp ? buck : buck + 1 - (buck + 1 >= players.length && players.length)
    }
  }

  async play () {
    const { messageBus } = this.tournament
    while (!this.paused && this.table.players.length > 1) {
      await this.playHand()
      const { players } = this.table
      const eliminated = players.filter((player) => player.isBroke())
      if (this.pausing || eliminated.length) {
        this.paused = true
        eliminated.length && messageBus.next({ message: 'eliminated', payload: { pausing: !!this.pausing, players: eliminated, tableId: this.table.id } })
        if (this.pausing) {
          messageBus.next({ message: 'paused', payload: { tableId: this.table.id } })
          delete this.pausing
        }
        throw new Error('Break')
      }
    }
    return this.table.players[0]
  }

  async playHand () {
    this.resetTable()
    const { id: tableId, players, pot } = this.table
    const { logger, tables } = this.tournament
    const { ante, blinds: [smallBlind, bigBlind] } = this.tournament.getAnteAndBlinds()
    const handId = this.tournament.getHandId({ tableId })
    logger(identifyTable({ lastTableId: tables[tables.length - 1].id, tableId }) + chalk.green.underline(`Hand #${handId}, Table #${tableId}`))
    const positions = this.getPositions()
    logger(identifyTable({ lastTableId: tables[tables.length - 1].id, tableId }) + chalk.cyan(`Seat ${positions.button + 1} is the button`))
    for (const [seat, player] of players.entries()) {
      logger(identifyTable({ lastTableId: tables[tables.length - 1].id, tableId }) + chalk.blue(`Seat ${seat + 1}: ${player.name} (${player.stack} in chips)`))
    }
    if (ante > 0) {
      await this.ringActivePlayers({
        fn: (player) => {
          const chips = player.pay({ amount: ante })
          pot.addChips({ chips, playerName: player.name })
          logger(identifyTable({ lastTableId: tables[tables.length - 1].id, tableId }) + chalk.gray(`${player.name}: posts the ante ${chips}${player.isAllIn ? ' and is all-in' : ''}`))
        }
      })
      pot.normalize({ activePlayerNames: this.activePlayers.map((player) => player.name) })
    }
    logger(identifyTable({ lastTableId: tables[tables.length - 1].id, tableId }) + chalk.yellow('*** HOLE CARDS ***'))
    await this.dealCards()
    let chips
    let currentBet = 0
    if (!players[positions.smallBlind].isAllIn) {
      chips = players[positions.smallBlind].pay({ amount: smallBlind })
      currentBet = chips
      pot.addChips({ chips, playerName: players[positions.smallBlind].name })
      logger(identifyTable({ lastTableId: tables[tables.length - 1].id, tableId }) + chalk.gray(`${players[positions.smallBlind].name}: posts small blind ${chips}${players[positions.smallBlind].isAllIn ? ' and is all-in' : ''}`))
    }
    if (!players[positions.bigBlind].isAllIn) {
      chips = players[positions.bigBlind].pay({ amount: bigBlind })
      currentBet = chips > currentBet ? chips : currentBet
      pot.addChips({ chips, playerName: players[positions.bigBlind].name })
      logger(identifyTable({ lastTableId: tables[tables.length - 1].id, tableId }) + chalk.gray(`${players[positions.bigBlind].name}: posts big blind ${chips}${players[positions.bigBlind].isAllIn ? ' and is all-in' : ''}`))
    }
    if (players.filter((player) => player.name !== players[positions.smallBlind].name && player.name !== players[positions.bigBlind].name && !player.isAllIn).length) {
      currentBet = bigBlind
    } else if (players.length === 2 && (players[positions.smallBlind].isAllIn || players[positions.bigBlind].isAllIn)) {
      pot.normalize({ activePlayerNames: this.activePlayers.map((player) => player.name) })
    }
    await this.bettingRound({ currentBet, lastTableId: tables[tables.length - 1].id, logger, pot, startAt: players.length === 2 ? 1 : 2, tableId })
    pot.normalize({ activePlayerNames: this.activePlayers.map((player) => player.name) })
    for (let i = 0; i < 3; i++) {
      if (this.activePlayers.length > 1) {
        await this.deck.deal() // Burn card
        const cards = await this.deck.deal(i === 0 ? 3 : 1)
        this.table.receiveCards({ cards })
        logger(identifyTable({ lastTableId: tables[tables.length - 1].id, tableId }) + chalk.yellow(`*** ${i === 0 ? 'FLOP' : (i === 1 ? 'TURN' : 'RIVER')} *** [${this.table.cards.reduce((cards, card) => cards + ' ' + card.reveal(), '').slice(1)}]`))
        if (this.activePlayers.filter((player) => !player.isAllIn).length > 1) {
          await this.bettingRound({ lastTableId: tables[tables.length - 1].id, logger, pot, tableId })
        }
      }
    }
    logger(identifyTable({ lastTableId: tables[tables.length - 1].id, tableId }) + chalk.yellow('*** SHOW DOWN ***'))
    const hands = {}
    await this.ringActivePlayers({
      fn: (player) => {
        const hand = Hand.solve(cardsToArray({ cardsShown: player.showCards() }).concat(cardsToArray({ cardsShown: this.table.showCards() })))
        logger(identifyTable({ lastTableId: tables[tables.length - 1].id, tableId }) + chalk.white(`${player.name}: shows ${player.showCards()} (${hand.descr})`))
        hands[player.name] = hand
      }
    })
    const winners = pot.getPlayerNamesPerPot().map((playerNames) => {
      const handsPerPot = Object.keys(hands).filter((playerName) => playerNames.includes(playerName)).map((playerName) => hands[playerName])
      return Hand.winners(handsPerPot).map((winner) => {
        const cards = winner.cardPool.reduce((cards, card) => cards + ' ' + card.value + card.suit, '').slice(1).split(' ').filter((card) => !cardsToArray({ cardsShown: this.table.showCards() }).includes(card))
        return this.activePlayers.find((player) => cardsToArray({ cardsShown: player.showCards() }).includes(cards[0]))
      }).map((player) => player.name)
    })
    const collected = pot.collect({ winners })
    for (const player of this.activePlayers.filter((player) => Object.keys(collected).includes(player.name))) {
      player.receiveChips({ chips: collected[player.name] })
      logger(identifyTable({ lastTableId: tables[tables.length - 1].id, tableId }) + chalk.green(`${player.name} collected ${collected[player.name]} from pot`))
    }
  }

  async processMessage ({ message }) {
    const { errors } = this.tournament
    try {
      switch (message) {
        case 'pause': {
          if (!this.paused) {
            this.pausing = true
          }
          break
        }
        case 'play': {
          delete this.paused
          const winner = await this.play()
          console.log(gradient.rainbow(`Winner is ${winner.name} with ${winner.stack} chips`))
          break
        }
      }
    } catch (error) {
      if (errorToString({ error }) !== 'Break') {
        const { id: tableId } = this.table
        errors.next({ error, tableId })
      }
    }
  }

  resetTable () {
    const { buck, players } = this.table
    this.table.reset({ buck: (Number.isInteger(buck) && (buck + 1 < players.length ? buck + 1 : 0)) || 0 })
    const activePlayers = []
    const positions = this.getPositions()
    for (const i of [0, 1]) {
      for (const [seat, player] of players.entries()) {
        if (i === 0 && seat > positions.button) {
          activePlayers.push(player)
        } else if (i === 1 && seat <= positions.button) {
          activePlayers.push(player)
        }
      }
    }
    this.activePlayers = activePlayers
  }

  async ringActivePlayers ({ fn, skipAllIn = false, skipLast = false, startAt = 0 }) {
    const activePlayers = this.activePlayers.slice()
    for (let i = 0; i < startAt; i++) {
      activePlayers.push(activePlayers.shift())
    }
    skipLast && activePlayers.pop()
    await from(skipAllIn ? activePlayers.filter((player) => !player.isAllIn) : activePlayers).pipe(
      concatMap(async (player) => {
        if (!skipAllIn || (skipAllIn && !player.isAllIn)) {
          await fn(player)
        }
      }),
      catchError((error) => errorToString({ error }) === 'Break' ? empty() : throwError(error))
    ).toPromise()
  }

  subscribe () {
    const { messageBus } = this.tournament
    this.messageBus = messageBus.subscribe(this.processMessage.bind(this))
  }

  unsubscribe () {
    this.messageBus.unsubscribe()
  }
}

module.exports = Dealer
