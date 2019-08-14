const arrayShuffle = require('array-shuffle')
const chalk = require('chalk')

const colors = arrayShuffle(['red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'])

function identify ({ tableId }) {
  return chalk.bgKeyword(colors[tableId % colors.length])(tableId.toString().padStart(3))
}

module.exports = identify
