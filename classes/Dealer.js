const chalk = require('chalk')
const { concatMap } = require('rxjs/operators')
const { from } = require('rxjs')

const Deck = require('./Deck')

class Dealer {
  constructor ({ table, tournament }) {
    this.deck = new Deck()
    this.table = table
    this.tournament = tournament
    tournament.messageBus.subscribe((message) => this.processMessage({ message }))
  }

  dealCards (howMany = 2) {
    return new Promise(async (resolve, reject) => {
      try {
        this.deck.shuffle()
        for (let i = 0; i < howMany; i++) {
          await this.ringActivePlayers({
            fn: async (player) => {
              const card = await this.deck.deal()
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

  playHand () {
    return new Promise(async (resolve, reject) => {
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
              logger(chalk.gray(`${player.name}: posts the ante ${chips}`))
            }
          })
          // pot.normalize()
        }
        logger(chalk.yellow('*** HOLE CARDS ***'))
        await this.dealCards()
        const [smallBlind, bigBlind] = blinds
        let chips = this.activePlayers[0].pay({ amount: smallBlind })
        pot.addChips({ chips, player: this.activePlayers[0] })
        logger(chalk.gray(`${this.activePlayers[0].name}: posts small blind ${chips}`))
        chips = this.activePlayers[1].pay({ amount: bigBlind })
        pot.addChips({ chips, player: this.activePlayers[1] })
        logger(chalk.gray(`${this.activePlayers[1].name}: posts big blind ${chips}`))
        // pot.normalize()
        await this.ringActivePlayers({
          fn: async (player) => {
            await player.decide()
          },
          skips: 2
        })
        this.ringActivePlayers({ fn: (player) => logger(player.showCards()) })
      } catch (error) {
        return reject(error)
      }
    })
  }

  async processMessage ({ message }) {
    try {
      switch (message) {
        case 'play': {
          await this.playHand()
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

  ringActivePlayers ({ fn, skips = 0 }) {
    return new Promise(async (resolve, reject) => {
      try {
        await from(this.activePlayers.entries()).pipe(
          concatMap(async ([position, player]) => {
            if (position >= skips) {
              await fn(player)
            }
          })
        ).toPromise()
        return resolve()
      } catch (error) {
        return reject(error)
      }
    })
  }
}

module.exports = Dealer
