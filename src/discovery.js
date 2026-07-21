export const METRICS = [
  { key: 'chargedEnergy', slug: 'charged_energy', name: 'Charged Energy', unit: 'kWh', deviceClass: 'energy' },
  { key: 'solarCharged', slug: 'solar_charged', name: 'Solar Charged', unit: 'kWh', deviceClass: 'energy' },
  { key: 'gridCharged', slug: 'grid_charged', name: 'Grid Charged', unit: 'kWh', deviceClass: 'energy' },
  { key: 'sessionSolarPercentage', slug: 'solar_percentage', name: 'Solar Percentage', unit: '%' },
  { key: 'price', slug: 'price', name: 'Charged Price', unit: '€', deviceClass: 'monetary' },
  { key: 'pricePerKWh', slug: 'price_per_kwh', name: 'Price per kWh', unit: '€/kWh' },
  { key: 'co2', slug: 'co2', name: 'CO2', unit: 'g', deviceClass: 'weight' },
  { key: 'co2PerKWh', slug: 'co2_per_kwh', name: 'CO2 per kWh', unit: 'g/kWh' },
  { key: 'savePrice', slug: 'save_price', name: 'Solar Savings', unit: '€', deviceClass: 'monetary' },
  { key: 'pricePer100Km', slug: 'price_per_100km', name: 'Price per 100km', unit: '€/100km' },
];

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
  return components;
}

export function buildDeviceDiscoveryPayload(config) {
  return {
    device: {
      identifiers: [config.topicPrefix],
      manufacturer: 'evcc2mqtt',
      name: 'EVCC',
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
