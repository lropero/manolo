const chalk = require('chalk')
const { cross } = require('figures')

const { Tournament } = require('./classes')
const { errorToString } = require('./utils')

const run = async () => {
  try {
    const config = {
      ante: 5,
      blinds: [25, 50],
      playersPerTable: 9,
      startingChips: 10000
    }
    const logger = console.log // Winston?
    const playerNames = ['bob', 'bruce', 'chucky', 'coco', 'daniel', 'diego', 'ganga', 'miguel', 'pepe']
    const tournament = await Tournament.initialize({ config, logger, playerNames })
    tournament.run()
  } catch (error) {
    console.log(`${chalk.red(cross)} ${errorToString(error)}`)
    if (error.stack) {
      console.log(chalk.gray(error.stack))
    }
    process.exit(0)
  }
}

run()
