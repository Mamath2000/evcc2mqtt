import { createLogger } from './logger.js';
import { consumptionStateTopic } from './discovery.js';

// Fixed vehicle consumption (Wh/km), read from a retained MQTT topic.
// TODO: revisit later for a per-month consumption table.
export function createConsumptionTracker(client, config) {
  const logger = createLogger(config.logLevel);
  const outTopic = consumptionStateTopic(config);
  let value = null;

  client.subscribe(config.consoTopic, (err) => {
    if (err) logger.error('failed to subscribe to conso topic:', err);
  });

  client.on('message', (topic, payload) => {
    if (topic !== config.consoTopic) return;
    const parsed = Number(payload.toString());
    if (!Number.isNaN(parsed)) {
      value = parsed;
      logger.info(`vehicle consumption updated: ${value} Wh/km`);
      client.publish(outTopic, String(value), { qos: 0, retain: true });
    }
  });

  return { get: () => value };
}
