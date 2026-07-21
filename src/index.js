import { config } from './config.js';
import { fetchCurrentMonthSessions } from './evccApi.js';
import { sessionsForDay, computeDayAggregate, localDateKey } from './aggregate.js';
import { createMqttClient } from './mqttClient.js';
import { publishDeviceDiscovery, publishState, publishDebugSessions } from './discovery.js';
import { createConsumptionTracker } from './consumption.js';
import { createLogger } from './logger.js';

const logger = createLogger(config.logLevel);

async function run(client, consumption) {
  try {
    const sessions = await fetchCurrentMonthSessions(config);
    const today = localDateKey(new Date());
    const todaySessions = sessionsForDay(sessions, today);
    publishDebugSessions(client, config, todaySessions);
    logger.debug(`fetched ${sessions.length} session(s) this month, ${todaySessions.length} for today`);

    if (todaySessions.length === 0) {
      logger.info(`no sessions for today (${today}), skipping`);
      return;
    }

    const aggregate = computeDayAggregate(todaySessions, consumption.get());
    publishState(client, config, aggregate);
    logger.info(`published state (${today})`);
    logger.debug('aggregate', aggregate);
  } catch (err) {
    logger.error('run failed:', err);
  }
}

const client = createMqttClient(config);
const consumption = createConsumptionTracker(client, config);
let interval;

// HA discovery is retained (no need to resend it on every reconnect) and the
// polling loop must only ever be armed once: MQTT reconnects fire another
// "connect" event, and re-arming setInterval on each one would stack up
// duplicate polling loops running in parallel over time.
client.once('connect', () => {
  publishDeviceDiscovery(client, config);
  run(client, consumption);
  interval = setInterval(() => run(client, consumption), config.pollIntervalMs);
});

function shutdown() {
  clearInterval(interval);
  client.end(true, {}, () => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
