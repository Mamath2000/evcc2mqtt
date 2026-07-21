import { test } from 'node:test';
import assert from 'node:assert/strict';
import { round, localDateKey, sessionsForDay, computeDayAggregate } from '../src/aggregate.js';

test('round rounds to the given number of decimals', () => {
  assert.equal(round(1.23456, 3), 1.235);
  assert.equal(round(1.2), 1.2);
});

test('localDateKey formats using local date parts, not UTC', () => {
  assert.equal(localDateKey(new Date(2026, 6, 21)), '2026-07-21');
  assert.equal(localDateKey(new Date(2026, 0, 5)), '2026-01-05');
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
