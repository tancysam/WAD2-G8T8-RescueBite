// Shared display helpers for prices and collection times.

export function formatPrice(value) {
  const price = Number(value)
  if (!(price >= 0)) return 'S$0.00'
  return 'S$' + price.toFixed(2)
}

// "8:00:00 PM" becomes "8:00 PM"
export function shortTime(value) {
  const date = new Date(value)
  if (!(Number(date) > 0)) return ''

  // Some browsers put a narrow space before AM/PM, so read it from the end
  const text = date.toLocaleTimeString('en-US')
  const clock = text.split(':').slice(0, 2).join(':')
  const period = text.substring(text.length - 2)
  return clock + ' ' + period
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// "16/10/2026" becomes "16 Oct", with the year only when it is not this year
export function shortDate(value) {
  const date = new Date(value)
  if (!(Number(date) > 0)) return ''

  const parts = date.toLocaleDateString('en-GB').split('/')
  const thisYear = new Date().toLocaleDateString('en-GB').split('/')[2]
  let text = parseInt(parts[0]) + ' ' + MONTHS[parseInt(parts[1]) - 1]
  if (parts[2] !== thisYear) text = text + ' ' + parts[2]
  return text
}

// "Today" or a short day such as "16 Oct"
export function dayLabel(value) {
  const date = new Date(value)
  if (!(Number(date) > 0)) return ''

  if (date.toLocaleDateString('en-GB') === new Date().toLocaleDateString('en-GB')) return 'Today'
  return shortDate(value)
}

// Pickup window in plain words:
// "Today, 8:00 PM–9:30 PM" when it starts and ends on one day,
// "Until 24 Feb 2027, 11:14 PM" when it is already open and runs over several days,
// "16 Oct, 8:00 PM – 18 Oct, 9:00 AM" when it has not opened yet.
export function collectionWindow(start, end) {
  const from = shortTime(start)
  if (!from) return 'Collection time unavailable'

  const startDay = dayLabel(start)
  const endDay = dayLabel(end)
  if (startDay === endDay) {
    return startDay + ', ' + from + '–' + shortTime(end)
  }
  if (new Date(start) <= new Date()) {
    return 'Until ' + endDay + ', ' + shortTime(end)
  }
  return startDay + ', ' + from + ' – ' + endDay + ', ' + shortTime(end)
}

export function savingsPercent(original, rescue) {
  const originalPrice = Number(original)
  const rescuePrice = Number(rescue)
  if (!(originalPrice > 0) || rescuePrice < 0) return null
  return Math.round(((originalPrice - rescuePrice) / originalPrice) * 100)
}
