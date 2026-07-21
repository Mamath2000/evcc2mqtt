import { config } from './config.js';
import { fetchCurrentMonthSessions } from './evccApi.js';
import { groupSessionsByDay, computeDayAggregate, localDateKey } from './aggregate.js';
import { createMqttClient } from './mqttClient.js';
import { publishDeviceDiscovery, publishState } from './discovery.js';
import { createConsumptionTracker } from './consumption.js';

async function run(client, consumption) {
  try {
    const sessions = await fetchCurrentMonthSessions(config);
    const grouped = groupSessionsByDay(sessions);

    const today = localDateKey(new Date());
    const todaySessions = grouped.get(today);

    if (!todaySessions || todaySessions.length === 0) {
      console.log(`[evcc2mqtt] no sessions for today (${today}), skipping`);
      return;
    }

    const aggregate = computeDayAggregate(todaySessions, consumption.get());
    publishState(client, config, aggregate);
    console.log(`[evcc2mqtt] published state (${today})`, aggregate);
  } catch (err) {
    console.error('[evcc2mqtt] run failed:', err);
  }
}

const client = createMqttClient(config);
let interval;

client.on('connect', () => {
  console.log('[evcc2mqtt] connected to MQTT broker');
  publishDeviceDiscovery(client, config);

  const consumption = createConsumptionTracker(client, config);

  run(client, consumption);
  interval = setInterval(() => run(client, consumption), config.pollIntervalMs);
});

client.on('error', (err) => {
  console.error('[evcc2mqtt] MQTT error:', err);
});

function shutdown() {
  clearInterval(interval);
  client.end(true, {}, () => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
