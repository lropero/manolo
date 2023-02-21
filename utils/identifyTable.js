import arrayShuffle from 'array-shuffle'
import chalk from 'chalk'

const colors = arrayShuffle([
  ['Red', 'black'],
  ['Green', 'white'],
  ['Yellow', 'black'],
  ['Blue', 'white'],
  ['Magenta', 'black'],
  ['Cyan', 'black'],
  ['White', 'black'],
  ['Gray', 'white']
])

function identifyTable ({ lastTableId, tableId }) {
  const key = tableId % colors.length
  return `${chalk[`bg${colors[key][0]}`][colors[key][1]](tableId.toString().padStart(lastTableId.toString().length))} `
}

export default identifyTable
