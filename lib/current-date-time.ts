const TIMEZONE = 'Asia/Kolkata'

export type CurrentDateTime = {
  iso: string
  date: string
  day: string
  month: string
  year: string
  time: string
  timezone: string
  utcOffset: string
}

export function getCurrentDateTime(): CurrentDateTime {
  const now = new Date()
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    timeZoneName: 'longOffset',
  }).formatToParts(now)

  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
  const year = values.year
  const month = values.month
  const day = values.day
  const weekday = values.weekday
  const time = `${values.hour}:${values.minute}:${values.second} ${values.dayPeriod}`
  const offset = values.timeZoneName?.replace('GMT', '') || '+05:30'
  const date = `${month} ${day}, ${year}`

  return {
    iso: now.toISOString(),
    date,
    day: weekday,
    month,
    year,
    time,
    timezone: TIMEZONE,
    utcOffset: offset,
  }
}
