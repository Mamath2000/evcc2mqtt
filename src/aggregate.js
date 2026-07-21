export function round(value, decimals = 3) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function groupSessionsByDay(sessions) {
  const byDay = new Map();
  for (const session of sessions) {
    const day = session.created.split('T')[0];
    if (!byDay.has(day)) byDay.set(day, []);

    const solarCharged = round((session.chargedEnergy * session.solarPercentage) / 100);
    byDay.get(day).push({
      id: session.id,
      chargedEnergy: round(session.chargedEnergy),
      solarCharged,
      gridCharged: round(session.chargedEnergy - solarCharged),
      price: round(session.price),
      co2: round(session.co2PerKWh * session.chargedEnergy),
    });
  }
  return byDay;
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
