import { test } from 'node:test';
import assert from 'node:assert/strict';
import { round, localDateKey, previousDateKey, zonedDateParts, sessionsForDay, computeDayAggregate } from '../src/aggregate.js';

test('round rounds to the given number of decimals', () => {
  assert.equal(round(1.23456, 3), 1.235);
  assert.equal(round(1.2), 1.2);
});

test('localDateKey formats a UTC instant according to the given IANA zone', () => {
  // 10:00 UTC is the same calendar day everywhere relevant here.
  assert.equal(localDateKey(new Date('2026-07-21T10:00:00Z'), 'Europe/Paris'), '2026-07-21');
  assert.equal(localDateKey(new Date('2026-07-21T10:00:00Z'), 'UTC'), '2026-07-21');
});

test('localDateKey does not depend on the process/container clock timezone', () => {
  // Regression test for the production bug: 23:30 UTC on the 24th is already
  // 01:30 CEST on the 25th in Paris. A container running in UTC (no TZ set)
  // must not keep reporting "24" here, or the previous day's frozen total
  // gets recorded by HA as if it belonged to the new day.
  const midnightBoundary = new Date('2026-07-24T23:30:00Z');
  assert.equal(localDateKey(midnightBoundary, 'UTC'), '2026-07-24');
  assert.equal(localDateKey(midnightBoundary, 'Europe/Paris'), '2026-07-25');
});

test('previousDateKey returns the calendar day before', () => {
  assert.equal(previousDateKey('2026-07-21'), '2026-07-20');
});

test('previousDateKey rolls over month and year boundaries', () => {
  assert.equal(previousDateKey('2026-08-01'), '2026-07-31');
  assert.equal(previousDateKey('2026-01-01'), '2025-12-31');
});

test('zonedDateParts exposes the year/month/day used to pick the evcc API month', () => {
  // 31 Jul 23:30 UTC is already 1 Aug in Paris: fetchCurrentMonthSessions must
  // query August, not July, or it would miss the day's own sessions entirely.
  const monthBoundary = new Date('2026-07-31T23:30:00Z');
  assert.deepEqual(zonedDateParts(monthBoundary, 'UTC'), { year: '2026', month: '07', day: '31' });
  assert.deepEqual(zonedDateParts(monthBoundary, 'Europe/Paris'), { year: '2026', month: '08', day: '01' });
});

test('sessionsForDay keeps only the requested day and splits solar/grid energy', () => {
  const sessions = [
    { id: 1, created: '2026-07-21T08:00:00Z', chargedEnergy: 10, solarPercentage: 50, price: 2, co2PerKWh: 50 },
    { id: 2, created: '2026-07-21T18:00:00Z', chargedEnergy: 5, solarPercentage: 0, price: 1.5, co2PerKWh: 60 },
    { id: 3, created: '2026-07-20T09:00:00Z', chargedEnergy: 8, solarPercentage: 100, price: 0, co2PerKWh: 10 },
  ];

  const today = sessionsForDay(sessions, '2026-07-21');

  assert.equal(today.length, 2);
  assert.equal(today[0].chargedEnergy, 10);
  assert.equal(today[0].solarCharged, 5);
  assert.equal(today[0].gridCharged, 5);
});

test('sessionsForDay returns an empty array when no session matches the day', () => {
  const sessions = [{ id: 1, created: '2026-07-20T09:00:00Z', chargedEnergy: 8, solarPercentage: 100, price: 0, co2PerKWh: 10 }];
  assert.deepEqual(sessionsForDay(sessions, '2026-07-21'), []);
});

test('computeDayAggregate matches the original Node-RED "Day Calc" formulas', () => {
  const daySessions = [
    { id: 1, chargedEnergy: 10, solarCharged: 5, gridCharged: 5, price: 2, co2: 500 },
    { id: 2, chargedEnergy: 5, solarCharged: 0, gridCharged: 5, price: 1.5, co2: 300 },
  ];

  const aggregate = computeDayAggregate(daySessions, 165);

  assert.equal(aggregate.chargedEnergy, 15);
  assert.equal(aggregate.solarCharged, 5);
  assert.equal(aggregate.gridCharged, 10);
  assert.equal(aggregate.sessionSolarPercentage, 33.3);
  assert.equal(aggregate.price, 3.5);
  assert.equal(aggregate.co2, 800);
  assert.equal(aggregate.pricePerKWh, 0.233);
  assert.equal(aggregate.co2PerKWh, 53.33);
  assert.equal(aggregate.savePrice, 1.75);
  assert.equal(aggregate.pricePer100Km, 3.85);
});

test('computeDayAggregate returns 0 for pricePer100Km when no consumption value is available', () => {
  const daySessions = [{ id: 1, chargedEnergy: 10, solarCharged: 5, gridCharged: 5, price: 2, co2: 500 }];
  const aggregate = computeDayAggregate(daySessions, null);
  assert.equal(aggregate.pricePer100Km, 0);
});

test('computeDayAggregate does not divide by zero on a 100% solar day', () => {
  const daySessions = [{ id: 1, chargedEnergy: 10, solarCharged: 10, gridCharged: 0, price: 0, co2: 0 }];
  const aggregate = computeDayAggregate(daySessions, 165);

  assert.equal(aggregate.gridCharged, 0);
  assert.equal(Number.isFinite(aggregate.savePrice), true);
  assert.equal(aggregate.savePrice, 0);
});

test('computeDayAggregate returns all zeros (not NaN) when there are no sessions yet today', () => {
  // Regression test: the caller must be able to publish this as-is so the
  // retained MQTT state resets at the start of the day, instead of skipping
  // the publish and leaving yesterday's frozen total in place.
  const aggregate = computeDayAggregate([], 165);

  for (const value of Object.values(aggregate)) {
    assert.equal(typeof value, 'number');
    assert.equal(Number.isNaN(value), false);
    assert.equal(value, 0);
  }
});
