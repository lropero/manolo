const chalk = require('chalk')
const { cross } = require('figures')

const { Tournament } = require('./classes')
const { errorToString } = require('./utils')

const run = async ({ config, logger, playerNames }) => {
  try {
    const tournament = await Tournament.initialize({ config, logger, playerNames })
    tournament.run()
  } catch (error) {
    logger(`${chalk.red(cross)} ${errorToString({ error })}`)
    if (error.stack) {
      logger(chalk.yellow(error.stack))
    }
    process.exit(1)
  }
}

const config = {
  ante: 50,
  blinds: [500, 1000],
  playersPerTable: 9,
  startingChips: 10000
}
const logger = console.log // Winston?
const playerNames = new Array(27).fill('').map((player, index) => `player${index + 1}`)
run({ config, logger, playerNames })
