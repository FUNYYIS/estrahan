const test = require('node:test');
const assert = require('node:assert/strict');
const { createInMemoryRateLimiter } = require('../rate-limit');

test('allows requests below the configured limit', () => {
  const limiter = createInMemoryRateLimiter();

  assert.deepEqual(limiter.check({
    uid: 'user-a',
    operation: 'send',
    limit: 3,
    windowMs: 1000,
    now: 100
  }), { ok: true });
  assert.deepEqual(limiter.check({
    uid: 'user-a',
    operation: 'send',
    limit: 3,
    windowMs: 1000,
    now: 200
  }), { ok: true });
});

test('rejects when the configured limit is exceeded', () => {
  const limiter = createInMemoryRateLimiter();

  limiter.check({ uid: 'user-a', operation: 'send', limit: 2, windowMs: 1000, now: 0 });
  limiter.check({ uid: 'user-a', operation: 'send', limit: 2, windowMs: 1000, now: 100 });

  const result = limiter.check({
    uid: 'user-a',
    operation: 'send',
    limit: 2,
    windowMs: 1000,
    now: 200
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'resource-exhausted');
  assert.equal(result.retryAfterSeconds, 1);
});

test('resets after the time window expires', () => {
  const limiter = createInMemoryRateLimiter();

  limiter.check({ uid: 'user-a', operation: 'send', limit: 1, windowMs: 1000, now: 0 });
  assert.equal(limiter.check({
    uid: 'user-a',
    operation: 'send',
    limit: 1,
    windowMs: 1000,
    now: 999
  }).ok, false);
  assert.deepEqual(limiter.check({
    uid: 'user-a',
    operation: 'send',
    limit: 1,
    windowMs: 1000,
    now: 1000
  }), { ok: true });
});

test('keeps different users in separate buckets', () => {
  const limiter = createInMemoryRateLimiter();

  limiter.check({ uid: 'user-a', operation: 'send', limit: 1, windowMs: 1000, now: 0 });

  assert.deepEqual(limiter.check({
    uid: 'user-b',
    operation: 'send',
    limit: 1,
    windowMs: 1000,
    now: 100
  }), { ok: true });
});

test('keeps different operations in separate buckets', () => {
  const limiter = createInMemoryRateLimiter();

  limiter.check({ uid: 'user-a', operation: 'send', limit: 1, windowMs: 1000, now: 0 });

  assert.deepEqual(limiter.check({
    uid: 'user-a',
    operation: 'broadcast',
    limit: 1,
    windowMs: 1000,
    now: 100
  }), { ok: true });
});

test('prunes expired entries and evicts the oldest entries at max size', () => {
  const limiter = createInMemoryRateLimiter({ maxEntries: 2 });

  limiter.check({ uid: 'expired', operation: 'send', limit: 1, windowMs: 100, now: 0 });
  limiter.check({ uid: 'user-a', operation: 'send', limit: 1, windowMs: 1000, now: 200 });
  limiter.check({ uid: 'user-b', operation: 'send', limit: 1, windowMs: 1000, now: 201 });

  assert.equal(limiter.size(), 2);
  assert.equal(limiter.has('send:expired'), false);
  assert.equal(limiter.has('send:user-a'), true);
  assert.equal(limiter.has('send:user-b'), true);

  limiter.check({ uid: 'user-c', operation: 'send', limit: 1, windowMs: 1000, now: 202 });
  assert.equal(limiter.size(), 2);
  assert.equal(limiter.has('send:user-a'), false);
  assert.equal(limiter.has('send:user-b'), true);
  assert.equal(limiter.has('send:user-c'), true);
});

test('returns unauthenticated when uid is missing', () => {
  const limiter = createInMemoryRateLimiter();
  const result = limiter.check({
    uid: '',
    operation: 'send',
    limit: 1,
    windowMs: 1000,
    now: 0
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'unauthenticated');
});
