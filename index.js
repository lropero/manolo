import chalk from 'chalk'
import figures from 'figures'

import config from './config/index.js'
import { errorToString } from './utils/index.js'
import { Tournament } from './classes/index.js'

const run = async ({ config, logger, playerNames }) => {
  try {
    const tournament = await Tournament.initialize({
      config,
      logger,
      playerNames
    })
    await tournament.run()
  } catch (error) {
    logger(`${chalk.red(figures.cross)} ${errorToString({ error })}`)
    if (error.stack) {
      logger(chalk.yellow(error.stack))
    }
    process.exit(0)
  }
}

const logger = console.log // Winston?
const playerNames = new Array(config.numberOfPlayers).fill('').map((player, index) => `player${index + 1}`)
run({ config, logger, playerNames })
