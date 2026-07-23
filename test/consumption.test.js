import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createConsumptionTracker } from '../src/consumption.js';

function createFakeMqttClient() {
  const client = new EventEmitter();
  client.subscribedTopics = [];
  client.published = [];
  client.subscribe = (topic, cb) => {
    client.subscribedTopics.push(topic);
    cb?.(null);
  };
  client.publish = (topic, payload, opts) => client.published.push({ topic, payload, opts });
  return client;
}

const config = { consoTopic: 'evcc2mqtt/config/conso_wh_km', topicPrefix: 'evcc2mqtt' };

test('createConsumptionTracker subscribes to the configured topic and starts at null', () => {
  const client = createFakeMqttClient();
  const tracker = createConsumptionTracker(client, config);

  assert.deepEqual(client.subscribedTopics, ['evcc2mqtt/config/conso_wh_km']);
  assert.equal(tracker.get(), null);
});

test('createConsumptionTracker updates the value on a numeric message for its topic', () => {
  const client = createFakeMqttClient();
  const tracker = createConsumptionTracker(client, config);

  client.emit('message', 'evcc2mqtt/config/conso_wh_km', Buffer.from('165'));

  assert.equal(tracker.get(), 165);
});

test('createConsumptionTracker echoes the value to its own retained topic', () => {
  const client = createFakeMqttClient();
  createConsumptionTracker(client, config);

  client.emit('message', 'evcc2mqtt/config/conso_wh_km', Buffer.from('165'));

  assert.equal(client.published.length, 1);
  assert.equal(client.published[0].topic, 'evcc2mqtt/consumption');
  assert.equal(client.published[0].payload, '165');
  assert.equal(client.published[0].opts.retain, true);
});

test('createConsumptionTracker ignores messages on other topics', () => {
  const client = createFakeMqttClient();
  const tracker = createConsumptionTracker(client, config);

  client.emit('message', 'some/other/topic', Buffer.from('42'));

  assert.equal(tracker.get(), null);
  assert.equal(client.published.length, 0);
});

test('createConsumptionTracker ignores non-numeric payloads', () => {
  const client = createFakeMqttClient();
  const tracker = createConsumptionTracker(client, config);

  client.emit('message', 'evcc2mqtt/config/conso_wh_km', Buffer.from('not-a-number'));

  assert.equal(tracker.get(), null);
  assert.equal(client.published.length, 0);
});
