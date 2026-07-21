import mqtt from 'mqtt';

export function createMqttClient(config) {
  const statusTopic = `${config.topicPrefix}/status`;

  const client = mqtt.connect(config.mqtt.url, {
    username: config.mqtt.username,
    password: config.mqtt.password,
    clientId: config.mqtt.clientId,
    will: { topic: statusTopic, payload: 'offline', qos: 0, retain: true },
  });

  client.on('connect', () => {
    client.publish(statusTopic, 'online', { qos: 0, retain: true });
  });

  return client;
}
