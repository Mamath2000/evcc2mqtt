import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLogger } from '../src/logger.js';

function withCapturedConsole(fn) {
  const calls = { log: [], error: [] };
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...args) => calls.log.push(args);
  console.error = (...args) => calls.error.push(args);
  try {
    fn();
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
  return calls;
}

test('default "info" level logs info/error but not debug', () => {
  const logger = createLogger();
  const calls = withCapturedConsole(() => {
    logger.error('boom');
    logger.info('hello');
    logger.debug('verbose');
  });

  assert.equal(calls.error.length, 1);
  assert.equal(calls.log.length, 1);
});

test('"debug" level logs everything', () => {
  const logger = createLogger('debug');
  const calls = withCapturedConsole(() => {
    logger.error('boom');
    logger.info('hello');
    logger.debug('verbose');
  });

  assert.equal(calls.error.length, 1);
  assert.equal(calls.log.length, 2);
});

test('"error" level only logs errors', () => {
  const logger = createLogger('error');
  const calls = withCapturedConsole(() => {
    logger.error('boom');
    logger.info('hello');
    logger.debug('verbose');
  });

  assert.equal(calls.error.length, 1);
  assert.equal(calls.log.length, 0);
});

test('an unknown level falls back to "info"', () => {
  const logger = createLogger('nonsense');
  const calls = withCapturedConsole(() => {
    logger.info('hello');
    logger.debug('verbose');
  });

  assert.equal(calls.log.length, 1);
});
