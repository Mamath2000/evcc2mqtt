import { config } from './config.js';
import { fetchCurrentMonthSessions, fetchSessionsForMonth } from './evccApi.js';
import { sessionsForDay, computeDayAggregate, localDateKey, previousDateKey } from './aggregate.js';
import { createMqttClient } from './mqttClient.js';
import { publishDeviceDiscovery, publishTodayState, publishYesterdayState, publishDebugSessions } from './discovery.js';
import { createConsumptionTracker } from './consumption.js';
import { createLogger } from './logger.js';

const logger = createLogger(config.logLevel);

async function run(client, consumption) {
  try {
    const sessions = await fetchCurrentMonthSessions(config);
    const today = localDateKey(new Date(), config.timeZone);
    const yesterday = previousDateKey(today);
    const todaySessions = sessionsForDay(sessions, today);
    publishDebugSessions(client, config, todaySessions);
    logger.debug(`fetched ${sessions.length} session(s) this month, ${todaySessions.length} for today`);

    // Yesterday can fall in the previous calendar month (e.g. today is the
    // 1st): only issue a second API call when that's actually the case,
    // otherwise reuse the month already fetched above.
    const sameMonthAsToday = yesterday.slice(0, 7) === today.slice(0, 7);
    const yesterdaySessionsSource = sameMonthAsToday ? sessions : await fetchSessionsForMonth(config, yesterday);
    const yesterdaySessions = sessionsForDay(yesterdaySessionsSource, yesterday);

    // Always publish, even with zero sessions: otherwise the retained MQTT
    // state keeps showing the previous day's frozen total until the first
    // session of the new day appears, and HA records that stale value as if
    // it belonged to today.
    const todayAggregate = computeDayAggregate(todaySessions, consumption.get());
    const yesterdayAggregate = computeDayAggregate(yesterdaySessions, consumption.get());
    publishTodayState(client, config, todayAggregate);
    publishYesterdayState(client, config, yesterdayAggregate);

    if (todaySessions.length === 0) {
      logger.info(`no sessions for today (${today}) yet, published zeroed state`);
    } else {
      logger.info(`published state (${today})`);
      logger.debug('today aggregate', todayAggregate);
    }
    logger.debug(`published yesterday (${yesterday}) state`, yesterdayAggregate);
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
