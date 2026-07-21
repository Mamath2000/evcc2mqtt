import { test } from 'node:test';
import assert from 'node:assert/strict';
import { METRICS, buildDeviceDiscoveryPayload, publishState, publishDebugSessions } from '../src/discovery.js';

const config = { topicPrefix: 'evcc2mqtt', haDiscoveryPrefix: 'homeassistant' };

function createFakeMqttClient() {
  const published = [];
  return { published, publish: (topic, payload, opts) => published.push({ topic, payload, opts }) };
}

test('buildDeviceDiscoveryPayload declares one device with one component per metric', () => {
  const payload = buildDeviceDiscoveryPayload(config);

  assert.deepEqual(payload.device.identifiers, ['evcc2mqtt']);
  assert.equal(payload.availability[0].topic, 'evcc2mqtt/status');
  assert.equal(payload.state_topic, 'evcc2mqtt/sessions');
  assert.equal(Object.keys(payload.components).length, METRICS.length);
});

test('each component reads its value from the shared state topic via value_template', () => {
  const payload = buildDeviceDiscoveryPayload(config);

  for (const metric of METRICS) {
    const component = payload.components[`evcc2mqtt_${metric.slug}`];
    assert.ok(component, `missing component for metric ${metric.key}`);
    assert.equal(component.unique_id, `evcc2mqtt_${metric.slug}`);
    assert.equal(component.value_template, `{{ value_json.${metric.key} | default(0) }}`);
    assert.equal(component.platform, 'sensor');
  }
});

test('component ids are namespaced by the configured topic prefix', () => {
  const other = buildDeviceDiscoveryPayload({ ...config, topicPrefix: 'custom' });
  assert.deepEqual(other.device.identifiers, ['custom']);
  assert.ok(Object.keys(other.components).every((id) => id.startsWith('custom_')));
});

test('publishState publishes the aggregate as retained JSON on the sessions topic', () => {
  const client = createFakeMqttClient();
  publishState(client, config, { chargedEnergy: 10 });

  assert.equal(client.published.length, 1);
  assert.equal(client.published[0].topic, 'evcc2mqtt/sessions');
  assert.deepEqual(JSON.parse(client.published[0].payload), { chargedEnergy: 10 });
  assert.equal(client.published[0].opts.retain, true);
});

test('publishDebugSessions publishes the raw session list as retained JSON on the debug topic', () => {
  const client = createFakeMqttClient();
  const sessions = [{ id: 1, chargedEnergy: 10 }, { id: 2, chargedEnergy: 5 }];
  publishDebugSessions(client, config, sessions);

  assert.equal(client.published.length, 1);
  assert.equal(client.published[0].topic, 'evcc2mqtt/debug/sessions');
  assert.deepEqual(JSON.parse(client.published[0].payload), sessions);
  assert.equal(client.published[0].opts.retain, true);
});
