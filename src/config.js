import dotenv from 'dotenv';

dotenv.config();

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name}`);
  return value;
}

export const config = {
  evcc: {
    baseUrl: `http://${required('EVCC_HOST')}:${process.env.EVCC_PORT || 7070}`,
    lang: process.env.EVCC_LANG || 'fr',
  },
  mqtt: {
    url: required('MQTT_URL'),
    username: process.env.MQTT_USERNAME || undefined,
    password: process.env.MQTT_PASSWORD || undefined,
  },
  topicPrefix: process.env.TOPIC_PREFIX || 'evcc2mqtt',
  haDiscoveryPrefix: process.env.HA_DISCOVERY_PREFIX || 'homeassistant',
  haDeviceName: process.env.HA_DEVICE_NAME || 'EVCC (MQTT)',
  consoTopic: process.env.CONSO_TOPIC || 'evcc2mqtt/config/conso_wh_km',
  pollIntervalMs: Number(process.env.POLL_INTERVAL_MS || 60_000),
  logLevel: process.env.LOG_LEVEL || 'info',
};
