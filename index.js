const chalk = require('chalk')
const { cross } = require('figures')

const { Tournament } = require('./classes')
const { errorToString } = require('./utils')

const run = async ({ config, logger, playerNames }) => {
  try {
    const tournament = await Tournament.initialize({ config, logger, playerNames })
    tournament.run()
  } catch (error) {
    logger(`${chalk.red(cross)} ${errorToString(error)}`)
    if (error.stack) {
      logger(chalk.yellow(error.stack))
    }
    process.exit(0)
  }
}

const config = {
  ante: 5,
  blinds: [500, 1000],
  playersPerTable: 9,
  startingChips: 10000
}
const logger = console.log // Winston?
const playerNames = ['player1', 'player2', 'player3', 'player4', 'player5', 'player6', 'player7', 'player8', 'player9']
run({ config, logger, playerNames })
