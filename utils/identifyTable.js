const arrayShuffle = require('array-shuffle')
const chalk = require('chalk')

const colors = arrayShuffle([
  ['red', 'black'],
  ['green', 'white'],
  ['yellow', 'black'],
  ['blue', 'white'],
  ['magenta', 'black'],
  ['cyan', 'black'],
  ['white', 'black'],
  ['gray', 'white']
])

function identifyTable ({ lastTableId, tableId }) {
  const key = tableId % colors.length
  return `${chalk.bgKeyword(colors[key][0]).keyword(colors[key][1])(tableId.toString().padStart(lastTableId.toString().length))} `
}

module.exports = identifyTable
