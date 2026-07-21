import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchSessions, fetchCurrentMonthSessions } from '../src/evccApi.js';

test('fetchSessions builds the expected evcc URL and returns the parsed JSON body', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url) => {
    calls.push(url);
    return { ok: true, json: async () => [{ id: 1 }] };
  });

  const sessions = await fetchSessions('http://evcc.local:7070', 'fr', 7, 2026);

  assert.deepEqual(sessions, [{ id: 1 }]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0], 'http://evcc.local:7070/api/sessions?lang=fr&month=7&year=2026');
});

test('fetchSessions throws when the response is not ok', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => ({ ok: false, status: 500, statusText: 'Internal Server Error' }));

  await assert.rejects(
    () => fetchSessions('http://evcc.local:7070', 'fr', 7, 2026),
    /evcc sessions request failed \(500 Internal Server Error\)/,
  );
});

test('fetchCurrentMonthSessions requests the current calendar month', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url) => {
    calls.push(url);
    return { ok: true, json: async () => [] };
  });

  const now = new Date();
  await fetchCurrentMonthSessions({ evcc: { baseUrl: 'http://evcc.local:7070', lang: 'fr' } });

  assert.equal(calls.length, 1);
  assert.match(calls[0], new RegExp(`month=${now.getMonth() + 1}&year=${now.getFullYear()}$`));
});
