const chalk = require('chalk')
const gradient = require('gradient-string')
const { Hand } = require('pokersolver')
const { catchError, concatMap } = require('rxjs/operators')
const { difference } = require('lodash')
const { empty, from, throwError } = require('rxjs')

const Deck = require('./Deck')
const { cardsToArray, errorToString } = require('../utils')

class Dealer {
  constructor ({ table, tournament }) {
    this.deck = new Deck()
    this.table = table
    this.tournament = tournament
    tournament.messageBus.subscribe(this.processMessage.bind(this))
  }

  dealCards (howMany = 2) {
    return new Promise(async (resolve, reject) => { // eslint-disable-line no-async-promise-executor
      try {
        this.deck.shuffle()
        for (let i = 0; i < howMany; i++) {
          await this.ringActivePlayers({
            fn: async (player) => {
              const [card] = await this.deck.deal()
              player.receiveCard({ card })
            }
          })
        }
        return resolve()
      } catch (error) {
        return reject(error)
      }
    })
  }

  getPositions () {
    const { buck, players } = this.table
    return {
      bigBlind: players.length === 2 ? 1 - buck : buck + 2 - (buck + 2 >= players.length && players.length),
      button: buck,
      smallBlind: players.length === 2 ? buck : buck + 1 - (buck + 1 >= players.length && players.length)
    }
  }

  play () {
    return new Promise(async (resolve, reject) => { // eslint-disable-line no-async-promise-executor
      try {
        while (this.table.players.length > 1) {
          await this.playHand()
          const { players } = this.table
          const eliminated = players.filter((player) => player.isBroke())
          if (eliminated.length) {
            this.tournament.messageBus.next({ message: 'eliminated', payload: eliminated })
          }
        }
        return resolve(this.table.players[0])
      } catch (error) {
        return reject(error)
      }
    })
  }

  playHand () {
    return new Promise(async (resolve, reject) => { // eslint-disable-line no-async-promise-executor
      try {
        this.resetTable()
        const { id: tableId, players, pot } = this.table
        const { ante, blinds, logger } = this.tournament
        const handId = this.tournament.getHandId()
        logger(chalk.green.underline(`Hand #${handId}, Table #${tableId}`))
        const positions = this.getPositions()
        logger(chalk.cyan(`Seat ${positions.button + 1} is the button`))
        for (const [seat, player] of players.entries()) {
          logger(chalk.blue(`Seat ${seat + 1}: ${player.name} (${player.stack} in chips)`))
        }
        if (ante > 0) {
          await this.ringActivePlayers({
            fn: (player) => {
              const chips = player.pay({ amount: ante })
              pot.addChips({ chips, player })
              logger(chalk.gray(`${player.name}: posts the ante ${chips}${player.isAllIn ? ' and is all-in' : ''}`))
            }
          })
          pot.normalize({ activePlayers: this.activePlayers })
        }
        logger(chalk.yellow('*** HOLE CARDS ***'))
        await this.dealCards()
        const [smallBlind, bigBlind] = blinds
        let chips
        let currentBet = 0
        if (!this.activePlayers[0].isAllIn) {
          chips = this.activePlayers[0].pay({ amount: smallBlind })
          currentBet = chips
          pot.addChips({ chips, player: this.activePlayers[0] })
          logger(chalk.gray(`${this.activePlayers[0].name}: posts small blind ${chips}${this.activePlayers[0].isAllIn ? ' and is all-in' : ''}`))
        }
        if (!this.activePlayers[1].isAllIn) {
          chips = this.activePlayers[1].pay({ amount: bigBlind })
          currentBet = chips > currentBet ? chips : currentBet
          pot.addChips({ chips, player: this.activePlayers[1] })
          logger(chalk.gray(`${this.activePlayers[1].name}: posts big blind ${chips}${this.activePlayers[1].isAllIn ? ' and is all-in' : ''}`))
        }
        if (this.activePlayers.length === 2 && (this.activePlayers[0].isAllIn || this.activePlayers[1].isAllIn)) {
          if (this.activePlayers[0].isAllIn || currentBet <= pot.getLast({ player: this.activePlayers[0] })) {
            pot.normalize({ activePlayers: this.activePlayers })
          }
        }
        let skipLast = false
        let startAt = 2
        while (!pot.isSettled()) {
          let playerRaised = false
          await this.ringActivePlayers({
            fn: (player) => new Promise(async (resolve, reject) => { // eslint-disable-line no-async-promise-executor
              const decision = await player.decide({ activePlayers: this.activePlayers, currentBet })
              const split = decision.split(' ')
              const option = split[0]
              const chips = parseFloat(split[1])
              switch (option) {
                case 'call': {
                  pot.addChips({ chips, player })
                  logger(chalk.magenta(`${player.name}: calls ${chips}${player.isAllIn ? ' and is all-in' : ''}`))
                  if (this.activePlayers.filter((player) => !player.isAllIn).length === 1) {
                    return reject(new Error('Break'))
                  }
                  break
                }
                case 'check': {
                  logger(chalk.magenta(`${player.name}: checks`))
                  break
                }
                case 'fold': {
                  logger(chalk.magenta(`${player.name}: folds`))
                  this.activePlayers = this.activePlayers.filter((p) => p.name !== player.name)
                  if (this.activePlayers.length === 1) {
                    return reject(new Error('Break'))
                  }
                  break
                }
                case 'raise': {
                  pot.addChips({ chips, player })
                  currentBet = pot.getCommitted({ player })
                  logger(chalk.magenta(`${player.name}: raises to ${currentBet}${player.isAllIn ? ' and is all-in' : ''}`))
                  playerRaised = true
                  skipLast = true
                  startAt = this.activePlayers.findIndex((p) => p.name === player.name) + 1
                  startAt = startAt < this.activePlayers.length ? startAt : 0
                  return reject(new Error('Break'))
                }
              }
              return resolve()
            }),
            skipAllIn: true,
            skipLast,
            startAt
          })
          !playerRaised && pot.normalize({ activePlayers: this.activePlayers })
        }
        pot.normalize({ activePlayers: this.activePlayers })
        for (let i = 0; i < 3; i++) {
          if (this.activePlayers.length > 1) {
            await this.deck.deal() // Burn card
            const cards = await this.deck.deal(i === 0 ? 3 : 1)
            this.table.receiveCards({ cards })
            logger(chalk.yellow(`*** ${i === 0 ? 'FLOP' : (i === 1 ? 'TURN' : 'RIVER')} *** [${this.table.cards.reduce((cards, card) => cards + ' ' + card.reveal(), '').trim()}]`))
            // TODO: betting round
          }
        }
        logger(chalk.yellow('*** SHOW DOWN ***'))
        const hands = []
        await this.ringActivePlayers({ fn: (player) => {
          const hand = Hand.solve(cardsToArray(player.showCards()).concat(cardsToArray(this.table.showCards())))
          logger(chalk.white(`${player.name}: shows ${player.showCards()} (${hand.descr})`))
          hands.push(hand)
        } })
        const winners = Hand.winners(hands).map((winner) => {
          const cards = difference(winner.cardPool.reduce((cards, card) => cards + ' ' + card.value + card.suit, '').trim().split(' '), cardsToArray(this.table.showCards()))
          return this.activePlayers.filter((player) => cardsToArray(player.showCards()).includes(cards[0]))[0]
        })
        const collected = pot.collect()
        chips = Math.floor(collected / winners.length)
        if (winners.length > 1) {
          let remainder = 0
          let winner
          if (chips * winners.length !== collected) {
            remainder = collected - chips * winners.length
            winner = Math.floor(Math.random() * winners.length)
          }
          for (const [index, player] of winners.entries()) {
            let amount = chips
            if (remainder > 0 && index === winner) {
              amount += remainder
            }
            player.receiveChips({ chips: amount })
            logger(chalk.green(`${player.name} collected ${amount} from pot`))
          }
        } else {
          winners[0].receiveChips({ chips })
          logger(chalk.green(`${winners[0].name} collected ${chips} from pot`))
        }
        return resolve()
      } catch (error) {
        return reject(error)
      }
    })
  }

  async processMessage ({ message }) {
    try {
      switch (message) {
        case 'play': {
          const winner = await this.play()
          console.log(gradient.rainbow(`Winner is ${winner.name} with ${winner.stack} chips`))
          break
        }
      }
    } catch (error) {
      const { id: tableId } = this.table
      this.tournament.errors.next({ error, tableId })
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

  ringActivePlayers ({ fn, skipAllIn = false, skipLast = false, startAt = 0 }) {
    return new Promise(async (resolve, reject) => { // eslint-disable-line no-async-promise-executor
      try {
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
          catchError((error) => errorToString(error) === 'Break' ? empty() : throwError(error))
        ).toPromise()
        return resolve()
      } catch (error) {
        return reject(error)
      }
    })
  }
}

module.exports = Dealer
