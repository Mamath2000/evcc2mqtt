import { zonedDateParts } from './aggregate.js';

export async function fetchSessions(baseUrl, lang, month, year) {
  const url = `${baseUrl}/api/sessions?lang=${lang}&month=${month}&year=${year}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`evcc sessions request failed (${res.status} ${res.statusText}): ${url}`);
  }
  return res.json();
}

export async function fetchCurrentMonthSessions(config) {
  const { year, month } = zonedDateParts(new Date(), config.timeZone);
  return fetchSessions(config.evcc.baseUrl, config.evcc.lang, Number(month), Number(year));
}
