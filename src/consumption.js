// Fixed vehicle consumption (Wh/km), read from a retained MQTT topic.
// TODO: revisit later for a per-month consumption table.
export function createConsumptionTracker(client, config) {
  let value = null;

  client.subscribe(config.consoTopic, (err) => {
    if (err) console.error('[evcc2mqtt] failed to subscribe to conso topic:', err);
  });

  client.on('message', (topic, payload) => {
    if (topic !== config.consoTopic) return;
    const parsed = Number(payload.toString());
    if (!Number.isNaN(parsed)) {
      value = parsed;
      console.log(`[evcc2mqtt] vehicle consumption updated: ${value} Wh/km`);
    }
  });

  return { get: () => value };
}
