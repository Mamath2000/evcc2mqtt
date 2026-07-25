export function round(value, decimals = 3) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

// Uses an explicit IANA zone instead of the process's local time (`getFullYear`/`getMonth`/
// `getDate`), which otherwise depends on the host/container TZ setting. Without this, a
// container running in UTC (the Docker default) keeps believing it's "yesterday" until 00:00
// UTC — 02:00 in Paris during summer — and the previous day's frozen total gets recorded by HA
// as if it belonged to the new day.
export function zonedDateParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const byType = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return { year: byType.year, month: byType.month, day: byType.day };
}

export function localDateKey(date, timeZone) {
  const { year, month, day } = zonedDateParts(date, timeZone);
  return `${year}-${month}-${day}`;
}

export function sessionsForDay(sessions, dayStr) {
  return sessions
    .filter((session) => session.created.split('T')[0] === dayStr)
    .map((session) => {
      const solarCharged = round((session.chargedEnergy * session.solarPercentage) / 100);
      return {
        id: session.id,
        chargedEnergy: round(session.chargedEnergy),
        solarCharged,
        gridCharged: round(session.chargedEnergy - solarCharged),
        price: round(session.price),
        co2: round(session.co2PerKWh * session.chargedEnergy),
      };
    });
}

export function computeDayAggregate(daySessions, consoWhKm) {
  const merged = daySessions.reduce(
    (acc, s) => {
      acc.chargedEnergy += s.chargedEnergy;
      acc.solarCharged += s.solarCharged;
      acc.gridCharged += s.gridCharged;
      acc.price += s.price;
      acc.co2 += s.co2;
      return acc;
    },
    { chargedEnergy: 0, solarCharged: 0, gridCharged: 0, price: 0, co2: 0 },
  );

  // No sessions yet today: report zeros instead of NaN (0/0) so the retained
  // MQTT state actually resets at the start of each day, rather than the
  // caller skipping the publish and leaving yesterday's frozen total in place.
  if (merged.chargedEnergy === 0) {
    return {
      chargedEnergy: 0,
      solarCharged: 0,
      gridCharged: 0,
      sessionSolarPercentage: 0,
      price: 0,
      co2: 0,
      pricePerKWh: 0,
      co2PerKWh: 0,
      savePrice: 0,
      pricePer100Km: 0,
    };
  }

  const pricePerKWh = round(merged.price / merged.chargedEnergy, 3);
  // A 100% solar day has no grid-charged energy, so this stays undefined without a guard.
  const pricePerKWhHorsPV = merged.gridCharged > 0 ? round(merged.price / merged.gridCharged, 3) : 0;
  const savePrice = round(merged.solarCharged * pricePerKWhHorsPV, 3);
  const pricePer100Km = consoWhKm
    ? round((consoWhKm / 1000) * (merged.price / merged.chargedEnergy) * 100, 2)
    : 0;

  return {
    chargedEnergy: round(merged.chargedEnergy),
    solarCharged: round(merged.solarCharged),
    gridCharged: round(merged.gridCharged),
    sessionSolarPercentage: round((merged.solarCharged / merged.chargedEnergy) * 100, 1),
    price: round(merged.price, 2),
    co2: round(merged.co2, 1),
    pricePerKWh,
    co2PerKWh: round(merged.co2 / merged.chargedEnergy, 2),
    savePrice,
    pricePer100Km,
  };
}
