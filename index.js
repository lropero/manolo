const chalk = require('chalk')
const { cross } = require('figures')

const config = require('./config')
const { Tournament } = require('./classes')
const { errorToString } = require('./utils')

const run = async ({ config, logger, playerNames }) => {
  try {
    const tournament = await Tournament.initialize({ config, logger, playerNames })
    tournament.run()
  } catch (error) {
    logger(`${chalk.red(cross)} ${errorToString({ error })}`)
    process.exit(0)
  }
}

const logger = console.log // Winston?
const playerNames = new Array(135).fill('').map((player, index) => `player${index + 1}`)
run({ config, logger, playerNames })
