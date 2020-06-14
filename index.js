const chalk = require('chalk')
const { cross } = require('figures')

const config = require('./config')
const { Tournament } = require('./classes')
const { errorToString } = require('./utils')

const run = async ({ config, logger, playerNames }) => {
  try {
    const tournament = await Tournament.initialize({
      config,
      logger,
      playerNames
    })
    await tournament.run()
    console.log(
      "Hey, I'd like to know about your research, drop me an email :)"
    )
  } catch (error) {
    logger(`${chalk.red(cross)} ${errorToString({ error })}`)
    if (error.stack) {
      logger(chalk.yellow(error.stack))
    }
    process.exit(0)
  }
}

const logger = console.log // Winston?
const playerNames = new Array(config.numberOfPlayers)
  .fill('')
  .map((player, index) => `player${index + 1}`)
run({ config, logger, playerNames })
