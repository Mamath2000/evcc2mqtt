const LEVELS = { error: 0, info: 1, debug: 2 };

export function createLogger(level) {
  const threshold = LEVELS[level] ?? LEVELS.info;

  function log(levelName, fn, args) {
    if (LEVELS[levelName] <= threshold) fn(`[evcc2mqtt]`, ...args);
  }

  return {
    error: (...args) => log('error', console.error, args),
    info: (...args) => log('info', console.log, args),
    debug: (...args) => log('debug', console.log, args),
  };
}
