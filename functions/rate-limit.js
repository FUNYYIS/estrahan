const DEFAULT_MAX_ENTRIES = 500;

function createInMemoryRateLimiter(options = {}) {
  const entries = new Map();
  const maxEntries = normalizePositiveInteger(options.maxEntries, DEFAULT_MAX_ENTRIES);

  return {
    check({
      uid,
      operation,
      limit,
      windowMs,
      now = Date.now()
    } = {}) {
      if (!uid) {
        return {
          ok: false,
          code: 'unauthenticated',
          message: 'Authentication is required.'
        };
      }

      const operationKey = String(operation || 'unknown');
      const entryKey = `${operationKey}:${uid}`;
      const safeLimit = normalizePositiveInteger(limit, 1);
      const safeWindowMs = normalizePositiveInteger(windowMs, 60000);

      pruneExpiredEntries(entries, now);

      const current = entries.get(entryKey);
      if (current && current.resetAt > now) {
        if (current.count >= safeLimit) {
          const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
          return {
            ok: false,
            code: 'resource-exhausted',
            message: `Too many requests. Try again in ${retryAfterSeconds} seconds.`,
            retryAfterSeconds
          };
        }

        entries.delete(entryKey);
        entries.set(entryKey, {
          count: current.count + 1,
          resetAt: current.resetAt
        });
        return { ok: true };
      }

      evictOldestEntries(entries, maxEntries);
      entries.set(entryKey, {
        count: 1,
        resetAt: now + safeWindowMs
      });
      return { ok: true };
    },

    size() {
      return entries.size;
    },

    has(key) {
      return entries.has(key);
    },

    clear() {
      entries.clear();
    }
  };
}

function normalizePositiveInteger(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 1) return fallback;
  return Math.floor(number);
}

function pruneExpiredEntries(entries, now) {
  for (const [key, value] of entries) {
    if (!value || value.resetAt <= now) entries.delete(key);
  }
}

function evictOldestEntries(entries, maxEntries) {
  while (entries.size >= maxEntries) {
    const oldestKey = entries.keys().next().value;
    if (oldestKey === undefined) return;
    entries.delete(oldestKey);
  }
}

module.exports = {
  createInMemoryRateLimiter,
  evictOldestEntries,
  pruneExpiredEntries
};
