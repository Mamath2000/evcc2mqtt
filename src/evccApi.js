export async function fetchSessions(baseUrl, lang, month, year) {
  const url = `${baseUrl}/api/sessions?lang=${lang}&month=${month}&year=${year}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`evcc sessions request failed (${res.status} ${res.statusText}): ${url}`);
  }
  return res.json();
}

export async function fetchCurrentMonthSessions(config) {
  const now = new Date();
  return fetchSessions(config.evcc.baseUrl, config.evcc.lang, now.getMonth() + 1, now.getFullYear());
}
