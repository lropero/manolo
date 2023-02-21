import _ from 'lodash'
import stripAnsi from 'strip-ansi'

function cardsToArray ({ cardsShown }) {
  return _.chunk(
    stripAnsi(cardsShown).replace(/[\u2660\u2663\u2665\u2666]/g, suit => {
      switch (suit) {
        case '\u2660':
          return 's'
        case '\u2663':
          return 'c'
        case '\u2665':
          return 'h'
        case '\u2666':
          return 'd'
      }
    }),
    2
  ).map(card => card[0] + card[1])
}

export default cardsToArray
