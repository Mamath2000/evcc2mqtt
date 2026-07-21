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
let interval;

client.on('connect', () => {
  logger.info('connected to MQTT broker');
  publishDeviceDiscovery(client, config);

  const consumption = createConsumptionTracker(client, config);

  run(client, consumption);
  interval = setInterval(() => run(client, consumption), config.pollIntervalMs);
});

client.on('error', (err) => {
  logger.error('MQTT error:', err);
});

function shutdown() {
  clearInterval(interval);
  client.end(true, {}, () => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
