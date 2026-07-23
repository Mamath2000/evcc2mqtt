export const METRICS = [
  { key: 'chargedEnergy', slug: 'charged_energy', name: 'Énergie chargée', unit: 'kWh', deviceClass: 'energy' },
  { key: 'solarCharged', slug: 'solar_charged', name: 'Charge Solaire', unit: 'kWh', deviceClass: 'energy' },
  { key: 'gridCharged', slug: 'grid_charged', name: 'Import Réseau', unit: 'kWh', deviceClass: 'energy' },
  { key: 'sessionSolarPercentage', slug: 'solar_percentage', name: 'Part de Solaire', unit: '%' },
  { key: 'price', slug: 'price', name: 'Cout du jour', unit: '€', deviceClass: 'monetary' },
  { key: 'pricePerKWh', slug: 'price_per_kwh', name: 'Prix par kWh', unit: '€/kWh' },
  { key: 'co2', slug: 'co2', name: 'CO2 du jour', unit: 'g', deviceClass: 'weight' },
  { key: 'co2PerKWh', slug: 'co2_per_kwh', name: 'CO2 par kWh', unit: 'g/kWh' },
  { key: 'savePrice', slug: 'save_price', name: 'Economie', unit: '€', deviceClass: 'monetary' },
  { key: 'pricePer100Km', slug: 'price_per_100km', name: 'Prix pour 100Km', unit: '€/100km' },
];

const CONSUMPTION_SLUG = 'consumption';

export function consumptionStateTopic(config) {
  return `${config.topicPrefix}/consumption`;
}

function buildComponents(config) {
  const components = {};
  for (const metric of METRICS) {
    const id = `${config.topicPrefix}_${metric.slug}`;
    const component = {
      platform: 'sensor',
      unique_id: id,
      default_entity_id: `sensor.${id}`,
      name: metric.name,
      state_class: 'measurement',
      value_template: `{{ value_json.${metric.key} | default(0) }}`,
      has_entity_name: true,
      force_update: true,
    };
    if (metric.unit) component.unit_of_measurement = metric.unit;
    if (metric.deviceClass) component.device_class = metric.deviceClass;
    components[id] = component;
  }

  // Simple echo of the raw value read from CONSO_TOPIC, published on its own
  // topic (see consumption.js) so it doesn't depend on today having sessions.
  const consumptionId = `${config.topicPrefix}_${CONSUMPTION_SLUG}`;
  components[consumptionId] = {
    platform: 'sensor',
    unique_id: consumptionId,
    default_entity_id: `sensor.${consumptionId}`,
    name: 'Consommation',
    state_class: 'measurement',
    unit_of_measurement: 'Wh/km',
    state_topic: consumptionStateTopic(config),
    has_entity_name: true,
    force_update: true,
  };

  return components;
}

export function buildDeviceDiscoveryPayload(config) {
  return {
    device: {
      identifiers: [config.topicPrefix],
      manufacturer: 'evcc2mqtt',
      name: config.haDeviceName || 'EVCC (MQTT)',
    },
    origin: {
      name: 'evcc2mqtt',
    },
    availability: [{ topic: `${config.topicPrefix}/status` }],
    state_topic: `${config.topicPrefix}/sessions`,
    components: buildComponents(config),
  };
}

export function publishDeviceDiscovery(client, config) {
  const topic = `${config.haDiscoveryPrefix}/device/${config.topicPrefix}/config`;
  client.publish(topic, JSON.stringify(buildDeviceDiscoveryPayload(config)), { qos: 0, retain: true });
}

export function publishState(client, config, statePayload) {
  client.publish(`${config.topicPrefix}/sessions`, JSON.stringify(statePayload), { qos: 0, retain: true });
}

export function publishDebugSessions(client, config, sessions) {
  client.publish(`${config.topicPrefix}/debug/sessions`, JSON.stringify(sessions), { qos: 0, retain: true });
}
