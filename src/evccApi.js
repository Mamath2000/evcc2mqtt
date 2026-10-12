import { localDateKey } from './aggregate.js';

export async function fetchSessions(baseUrl, lang, month, year) {
  const url = `${baseUrl}/api/sessions?lang=${lang}&month=${month}&year=${year}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`evcc sessions request failed (${res.status} ${res.statusText}): ${url}`);
  }
  return res.json();
}

// Fetches the calendar month a given 'YYYY-MM-DD' key falls in, so callers can
// request the right month regardless of whether the day is "today" or not
// (e.g. "yesterday" when today is the 1st, which falls in the previous month).
export async function fetchSessionsForMonth(config, dateKey) {
  const [year, month] = dateKey.split('-').map(Number);
  return fetchSessions(config.evcc.baseUrl, config.evcc.lang, month, year);
}

export async function fetchCurrentMonthSessions(config) {
  return fetchSessionsForMonth(config, localDateKey(new Date(), config.timeZone));
}
