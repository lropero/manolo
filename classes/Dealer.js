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
    this.start()
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
    while (!this.paused && this.table.players.length > 1) {
      await this.playHand()
      const { players } = this.table
      const eliminated = players.filter((player) => player.isBroke())
      if (this.pausing || eliminated.length) {
        this.paused = true
        eliminated.length && this.tournament.messageBus.next({ message: 'eliminated', payload: { pausing: !!this.pausing, players: eliminated, tableId: this.table.id } })
        if (this.pausing) {
          this.tournament.messageBus.next({ message: 'paused', payload: { tableId: this.table.id } })
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
    const { ante, blinds, logger } = this.tournament
    const handId = this.tournament.getHandId()
    logger(identifyTable({ tableId }) + chalk.green.underline(`Hand #${handId}, Table #${tableId}`))
    const positions = this.getPositions()
    logger(identifyTable({ tableId }) + chalk.cyan(`Seat ${positions.button + 1} is the button`))
    for (const [seat, player] of players.entries()) {
      logger(identifyTable({ tableId }) + chalk.blue(`Seat ${seat + 1}: ${player.name} (${player.stack} in chips)`))
    }
    if (ante > 0) {
      await this.ringActivePlayers({
        fn: (player) => {
          const chips = player.pay({ amount: ante })
          pot.addChips({ chips, player })
          logger(identifyTable({ tableId }) + chalk.gray(`${player.name}: posts the ante ${chips}${player.isAllIn ? ' and is all-in' : ''}`))
        }
      })
      pot.normalize({ activePlayerNames: this.activePlayers.map((player) => player.name) })
    }
    logger(identifyTable({ tableId }) + chalk.yellow('*** HOLE CARDS ***'))
    await this.dealCards()
    const [smallBlind, bigBlind] = blinds
    let chips
    let currentBet = 0
    if (!players[positions.smallBlind].isAllIn) {
      chips = players[positions.smallBlind].pay({ amount: smallBlind })
      currentBet = chips
      pot.addChips({ chips, player: players[positions.smallBlind] })
      logger(identifyTable({ tableId }) + chalk.gray(`${players[positions.smallBlind].name}: posts small blind ${chips}${players[positions.smallBlind].isAllIn ? ' and is all-in' : ''}`))
    }
    if (!players[positions.bigBlind].isAllIn) {
      chips = players[positions.bigBlind].pay({ amount: bigBlind })
      currentBet = chips > currentBet ? chips : currentBet
      pot.addChips({ chips, player: players[positions.bigBlind] })
      logger(identifyTable({ tableId }) + chalk.gray(`${players[positions.bigBlind].name}: posts big blind ${chips}${players[positions.bigBlind].isAllIn ? ' and is all-in' : ''}`))
    }
    if (players.length > 2) {
      currentBet = bigBlind
    } else if (players[positions.smallBlind].isAllIn || players[positions.bigBlind].isAllIn) {
      if (players[positions.smallBlind].isAllIn || currentBet <= pot.getLast({ player: players[positions.smallBlind] })) {
        pot.normalize({ activePlayerNames: this.activePlayers.map((player) => player.name) })
      }
    }
    let skipLast = false
    let startAt = players.length === 2 ? 1 : 2
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
              pot.addChips({ chips, player })
              logger(identifyTable({ tableId }) + chalk.magenta(`${player.name}: calls ${chips}${player.isAllIn ? ' and is all-in' : ''}`))
              if (this.activePlayers.filter((player) => !player.isAllIn).length === 1) {
                throw new Error('Break')
              }
              break
            }
            case 'check': {
              logger(identifyTable({ tableId }) + chalk.magenta(`${player.name}: checks`))
              break
            }
            case 'fold': {
              logger(identifyTable({ tableId }) + chalk.magenta(`${player.name}: folds`))
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
              pot.addChips({ chips, player })
              currentBet = pot.getCommitted({ player })
              logger(identifyTable({ tableId }) + chalk.magenta(`${player.name}: raises to ${currentBet}${player.isAllIn ? ' and is all-in' : ''}`))
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
    pot.normalize({ activePlayerNames: this.activePlayers.map((player) => player.name) })
    for (let i = 0; i < 3; i++) {
      if (this.activePlayers.length > 1) {
        await this.deck.deal() // Burn card
        const cards = await this.deck.deal(i === 0 ? 3 : 1)
        this.table.receiveCards({ cards })
        logger(identifyTable({ tableId }) + chalk.yellow(`*** ${i === 0 ? 'FLOP' : (i === 1 ? 'TURN' : 'RIVER')} *** [${this.table.cards.reduce((cards, card) => cards + ' ' + card.reveal(), '').slice(1)}]`))
        // TODO: betting round
      }
    }
    logger(identifyTable({ tableId }) + chalk.yellow('*** SHOW DOWN ***'))
    const hands = {}
    await this.ringActivePlayers({ fn: (player) => {
      const hand = Hand.solve(cardsToArray({ cardsShown: player.showCards() }).concat(cardsToArray({ cardsShown: this.table.showCards() })))
      logger(identifyTable({ tableId }) + chalk.white(`${player.name}: shows ${player.showCards()} (${hand.descr})`))
      hands[player.name] = hand
    } })
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
      logger(identifyTable({ tableId }) + chalk.green(`${player.name} collected ${collected[player.name]} from pot`))
    }
  }

  async processMessage ({ message }) {
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
        this.tournament.errors.next({ error, tableId })
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

  start () {
    this.messageBus = this.tournament.messageBus.subscribe(this.processMessage.bind(this))
  }

  stop () {
    this.messageBus.unsubscribe()
  }
}

module.exports = Dealer
