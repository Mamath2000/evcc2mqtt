import mqtt from 'mqtt';
import { createLogger } from './logger.js';

export function createMqttClient(config) {
  const logger = createLogger(config.logLevel);
  const statusTopic = `${config.topicPrefix}/status`;

  const client = mqtt.connect(config.mqtt.url, {
    username: config.mqtt.username,
    password: config.mqtt.password,
    // No fixed clientId: mqtt.js generates a fresh random one per connection,
    // which avoids two instances/restarts fighting over the same client id
    // (the broker force-disconnects whichever connection loses that race).
    keepalive: 30,
    reconnectPeriod: 2000,
    // Last Will and Testament: the broker publishes this on our behalf if the
    // connection drops without a clean disconnect (crash, network loss, ...).
    // It backs the `availability_topic` declared in the HA discovery payload.
    will: { topic: statusTopic, payload: 'offline', qos: 1, retain: true },
  });

  client.on('connect', (packet) => {
    logger.info(packet.sessionPresent ? 'reconnected to MQTT broker' : 'connected to MQTT broker');
    client.publish(statusTopic, 'online', { qos: 1, retain: true });
  });

  client.on('reconnect', () => logger.debug('reconnecting to MQTT broker...'));
  client.on('close', () => logger.debug('MQTT connection closed'));
  client.on('offline', () => logger.info('MQTT client offline, will retry'));
  client.on('error', (err) => logger.error('MQTT error:', err));

  return client;
}
