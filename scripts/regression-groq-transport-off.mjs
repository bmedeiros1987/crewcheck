import assert from 'node:assert/strict';
import { test, after } from 'node:test';

// Synthetic only; even an accidental ambient fetch is forbidden before import.
const originalFetch = globalThis.fetch; let ambientCalls = 0;
globalThis.fetch = () => { ambientCalls++; throw Error('REAL_NETWORK_FORBIDDEN'); };
const { createGroqHttpTransport, GROQ_ENDPOINT, GROQ_TRANSPORT_LIMITS: limits } = await import('../server/concierge/groq-transport.mjs');
const key = 'gsk_SYNTHETIC_NOT_A_REAL_KEY_123456';
const question = 'SYNTHETIC_PRIVATE_QUESTION_987654';
const upstream = `UPSTREAM_ECHO_${key}_${question}`;
const request = () => ({ model: 'openai/gpt-oss-20b', messages: [
  { role: 'system', content: 'Return JSON only.' }, { role: 'user', content: question }],
  max_tokens: 128, response_format: { type: 'json_object' } });
const content = '{"tool":"nextDuty.read","arguments":{}}';
const payload = (value = content, finish = 'stop') => ({ choices: [{ finish_reason: finish, message: { role: 'assistant', content: value } }] });
const response = (value = payload(), options = {}) => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' }, ...options });
const transport = (fetchImpl = async () => response(), options = {}) => createGroqHttpTransport({ enabled: true, credential: key, fetchImpl, ...options });
async function rejectsSafe(work, code) {
  await assert.rejects(work, error => {
    assert.equal(error.name, 'GroqTransportError');
    if (code) assert.equal(error.code, 'GROQ_' + code);
    assert.match(error.message, /^GROQ_[A-Z_]+$/);
    assert.equal(Object.hasOwn(error, 'cause'), false);
    const description = `${error}\n${error.stack}\n${JSON.stringify(error)}`;
    for (const secret of [key, question, upstream]) assert.equal(description.includes(secret), false);
    return true;
  });
}
const logs = [];
const methods = ['log', 'error', 'warn', 'info', 'debug', 'trace'];
const consoles = methods.map(name => [name, console[name]]);
for (const name of methods) console[name] = (...args) => logs.push(args);
after(() => {
  globalThis.fetch = originalFetch;
  for (const [name, method] of consoles) console[name] = method;
  assert.equal(ambientCalls, 0, 'No real or ambient fetch');
  assert.deepEqual(logs, [], 'No request, credential, content or diagnostic logs');
});

test('default OFF ignores hostile request and never invokes injected or ambient fetch', async () => {
  let calls = 0;
  const off = createGroqHttpTransport({ credential: key, fetchImpl: () => { calls++; } });
  await rejectsSafe(() => off(new Proxy({}, { get() { throw Error(upstream); } })), 'OFF');
  assert.equal(calls, 0);
});
test('OFF does not evaluate credential accessors', async () => {
  const off = createGroqHttpTransport({ get credential() { throw Error(upstream); } });
  await rejectsSafe(() => off(request()), 'OFF');
});
for (const options of [{ model: 'unapproved' }, { fetchImpl: null }, { credential: 'bad\r\nheader' },
  { credential: '' }, { timeoutMs: 0 }, { timeoutMs: 1001 }, { maxCalls: 0 }, { maxCalls: 21 }]) {
  test('invalid enabled configuration is sanitized: ' + Object.keys(options).join(','), () => {
    assert.throws(() => transport(async () => response(), options), error => error.code === 'GROQ_CONFIG' && !String(error).includes(key));
  });
}
test('enabled requires explicit fetch; no default network client', () => {
  assert.throws(() => createGroqHttpTransport({ enabled: true, credential: key }), { code: 'GROQ_CONFIG' });
});
test('hostile configuration error is never reflected', () => {
  assert.throws(() => createGroqHttpTransport({ enabled: true, get credential() { throw Error(upstream); } }), { message: 'GROQ_CONFIG' });
});
test('fixed endpoint, omitted credentials, redirect:error and copied bounded body', async () => {
  const input = request(); let sent;
  const run = transport(async (url, options) => { sent = { url, options }; input.messages[1].content = 'changed-after-dispatch'; return response(); });
  assert.equal(await run(input), content);
  assert.equal(sent.url, GROQ_ENDPOINT);
  assert.equal(sent.options.redirect, 'error'); assert.equal(sent.options.credentials, 'omit');
  assert.equal(sent.options.cache, 'no-store'); assert.equal(sent.options.method, 'POST');
  assert.equal(sent.options.headers.authorization, `Bearer ${key}`);
  const body = JSON.parse(sent.options.body);
  assert.equal(body.messages[1].content, question);
  assert.equal(body.max_completion_tokens, 128); assert.equal(body.stream, false);
  assert.equal(sent.options.body.includes(key), false);
  assert.ok(Buffer.byteLength(sent.options.body) <= limits.inputBytes);
  await rejectsSafe(() => run(request()), 'BUDGET');
});
for (const mutate of [r => { r.model = 'synthetic-groq-contract'; }, r => { r.model = 'other'; },
  r => { r.url = 'https://outside.invalid'; }, r => { r.tools = []; }, r => { r.stream = true; },
  r => { r.max_tokens = 129; }, r => { r.max_tokens = 0; }, r => { r.messages[0].role = 'assistant'; },
  r => { r.messages[1].extra = key; }, r => { r.response_format.extra = true; },
  r => { r.messages[1].content = 'é'.repeat(512); }]) {
  test('unsafe request denied before HTTP: ' + mutate.toString().slice(0, 65), async () => {
    let calls = 0; const run = transport(async () => { calls++; return response(); });
    const input = request(); mutate(input);
    await rejectsSafe(() => run(input)); assert.equal(calls, 0);
  });
}
test('request and signal accessors cannot leak their thrown input', async () => {
  let calls = 0; const run = transport(async () => { calls++; return response(); });
  await rejectsSafe(() => run({ get model() { throw Error(upstream); } }), 'REQUEST');
  await rejectsSafe(() => run(request(), { get signal() { throw Error(upstream); } }), 'NETWORK');
  await rejectsSafe(() => run(request(), { signal: {} }), 'REQUEST');
  assert.equal(calls, 0);
});
test('outbound token budget is copied once before fetch, even with changing getters', async () => {
  let reads = 0, sent;
  const input = request(); Object.defineProperty(input, 'max_tokens', { enumerable: true, get: () => ++reads <= 3 ? 128 : 9000 });
  assert.equal(await transport(async (_url, options) => { sent = JSON.parse(options.body); return response(); })(input), content);
  assert.equal(sent.max_completion_tokens, 128);
});
for (const status of [301, 302, 307, 308]) test('redirect status never followed: ' + status, async () => {
  let calls = 0;
  const run = transport(async () => { calls++; return new Response(upstream, { status, headers: { location: 'https://outside.invalid' } }); });
  await rejectsSafe(() => run(request()), 'REDIRECT'); assert.equal(calls, 1);
});
test('followed redirect or unexpected response URL is rejected even if mock ignores policy', async () => {
  for (const props of [{ redirected: true }, { url: 'https://outside.invalid' }]) {
    const value = response(); for (const [key, item] of Object.entries(props)) Object.defineProperty(value, key, { value: item });
    await rejectsSafe(() => transport(async () => value)(request()), 'REDIRECT');
  }
});
for (const status of [401, 403, 400, 500, 503]) test('HTTP error is sanitized and never retried: ' + status, async () => {
  let calls = 0; const run = transport(async () => { calls++; return new Response(upstream, { status }); });
  await rejectsSafe(() => run(request()), [401, 403].includes(status) ? 'AUTH' : 'HTTP'); assert.equal(calls, 1);
});
test('network error and hostile thrown proxy never expose key/question/cause', async () => {
  for (const error of [Error(upstream), new Proxy({}, { get() { throw Error(upstream); } })]) {
    await rejectsSafe(() => transport(async () => { throw error; })(request()), 'NETWORK');
  }
});
test('a previously emitted error mutated by the caller cannot leak on rethrow', async () => {
  let prior;
  try { await createGroqHttpTransport()(request()); } catch (error) { prior = error; }
  prior.message = upstream; prior.code = upstream;
  Object.defineProperty(prior, 'stack', { get() { throw Error(upstream); } });
  await rejectsSafe(() => transport(async () => { throw prior; })(request()), 'OFF');
});
test('429 respects cooldown, has no queued retry, and counts failed attempt', async () => {
  let at = 0, calls = 0;
  const run = transport(async () => { calls++; return calls === 1 ? new Response(upstream, { status: 429, headers: { 'retry-after': '120' } }) : response(); }, { now: () => at, maxCalls: 2 });
  await rejectsSafe(() => run(request()), 'RATE_LIMIT');
  at = 119999; await rejectsSafe(() => run(request()), 'RATE_LIMIT'); assert.equal(calls, 1);
  at = 120000; assert.equal(await run(request()), content); assert.equal(calls, 2);
  await rejectsSafe(() => run(request()), 'BUDGET');
});
test('malformed/zero retry-after cannot create an immediate retry loop', async () => {
  for (const value of ['0', 'bad', '']) {
    let at = 0, calls = 0;
    const run = transport(async () => { calls++; return new Response(null, { status: 429, headers: { 'retry-after': value } }); }, { now: () => at, maxCalls: 2 });
    await rejectsSafe(() => run(request()), 'RATE_LIMIT'); at = 59999;
    await rejectsSafe(() => run(request()), 'RATE_LIMIT'); assert.equal(calls, 1);
  }
});
test('cooldown starts at response receipt, including HTTP-date retry-after', async () => {
  for (const value of ['60', new Date(120000).toUTCString()]) {
    let at = 0, calls = 0;
    const run = transport(async () => { calls++; at = 500;
      return new Response(null, { status: 429, headers: { 'retry-after': value } });
    }, { now: () => at, maxCalls: 2 });
    await rejectsSafe(() => run(request()), 'RATE_LIMIT');
    at = value === '60' ? 60499 : 119999;
    await rejectsSafe(() => run(request()), 'RATE_LIMIT'); assert.equal(calls, 1);
  }
});
test('unreadable clock on 429 keeps the capability closed instead of forgetting cooldown', async () => {
  let at = 1, calls = 0;
  const run = transport(async () => { calls++; at = NaN; return new Response(null, { status: 429 }); }, { now: () => at, maxCalls: 2 });
  await rejectsSafe(() => run(request()), 'CLOCK'); at = 100000;
  await rejectsSafe(() => run(request()), 'RATE_LIMIT'); assert.equal(calls, 1);
});
test('pre-aborted external signal prevents fetch', async () => {
  const controller = new AbortController(); controller.abort(); let calls = 0;
  await rejectsSafe(() => transport(async () => { calls++; })(request(), { signal: controller.signal }), 'ABORTED'); assert.equal(calls, 0);
});
test('external abort interrupts even uncooperative fetch; no retry or overlapping replacement', async () => {
  let calls = 0; const controller = new AbortController();
  const run = transport(() => { calls++; return new Promise(() => {}); }, { maxCalls: 2 });
  const pending = run(request(), { signal: controller.signal }); controller.abort();
  await rejectsSafe(() => pending, 'ABORTED');
  await rejectsSafe(() => run(request()), 'BUSY'); assert.equal(calls, 1);
});
test('deadline interrupts uncooperative fetch and aborts network signal', async () => {
  let observed;
  const run = transport((_url, options) => { observed = options.signal; return new Promise(() => {}); }, { timeoutMs: 10 });
  await rejectsSafe(() => run(request()), 'TIMEOUT'); assert.equal(observed.aborted, true);
});
test('a late fetch response is cancelled after timeout, never consumed or retried', async () => {
  let resolveFetch, cancelled = false;
  const run = transport(() => new Promise(resolve => { resolveFetch = resolve; }), { timeoutMs: 10 });
  await rejectsSafe(() => run(request()), 'TIMEOUT');
  const stream = new ReadableStream({ cancel() { cancelled = true; } });
  resolveFetch(new Response(stream, { headers: { 'content-type': 'application/json' } }));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(cancelled, true);
});
for (const interruption of ['timeout', 'abort']) for (const header of ['seconds', 'date']) {
  test(`late 429 after ${interruption} retains ${header} cooldown without reading/delivering body`, async () => {
    let at = 0, calls = 0, resolveLate, cancelled = 0, reads = 0;
    const external = new AbortController();
    const run = transport(() => {
      calls++;
      return calls === 1 ? new Promise(resolve => { resolveLate = resolve; }) : Promise.resolve(response());
    }, { timeoutMs: 10, maxCalls: 2, now: () => at });
    const first = run(request(), { signal: external.signal });
    if (interruption === 'abort') external.abort();
    await rejectsSafe(() => first, interruption === 'abort' ? 'ABORTED' : 'TIMEOUT');
    at = 500;
    const stream = new ReadableStream({ cancel() { cancelled++; } });
    stream.getReader = () => { reads++; throw Error(upstream); };
    const value = new Response(stream, { status: 429, headers: {
      'retry-after': header === 'seconds' ? '120' : new Date(120000).toUTCString(),
      'content-type': 'application/json',
    } });
    resolveLate(value);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(cancelled, 1); assert.equal(reads, 0);
    await rejectsSafe(() => run(request()), 'RATE_LIMIT'); assert.equal(calls, 1);
    const until = header === 'seconds' ? 120500 : 120000;
    at = until - 1; await rejectsSafe(() => run(request()), 'RATE_LIMIT'); assert.equal(calls, 1);
    at = until; assert.equal(await run(request()), content); assert.equal(calls, 2);
  });
}
test('failure to register abort signal is sanitized before HTTP', async () => {
  let calls = 0;
  const signal = { aborted: false, addEventListener() { throw Error(upstream); }, removeEventListener() {} };
  await rejectsSafe(() => transport(async () => { calls++; return response(); })(request(), { signal }), 'NETWORK');
  assert.equal(calls, 0);
});
test('concurrent invocation cannot bypass reserved slot or lifetime budget', async () => {
  let release, calls = 0;
  const run = transport(() => { calls++; return new Promise(resolve => { release = resolve; }); });
  const first = run(request()); await rejectsSafe(() => run(request()), 'BUSY');
  release(response()); assert.equal(await first, content);
  await rejectsSafe(() => run(request()), 'BUDGET'); assert.equal(calls, 1);
});
test('clock rollback/nonfinite denies before HTTP', async () => {
  let at = 2, calls = 0;
  const run = transport(async () => { calls++; return response(); }, { now: () => at, maxCalls: 2 });
  await run(request()); at = 1; await rejectsSafe(() => run(request()), 'CLOCK');
  at = NaN; await rejectsSafe(() => run(request()), 'CLOCK'); assert.equal(calls, 1);
});
for (const value of [new Response(upstream), response(payload(), { headers: { 'content-type': 'text/html' } }),
  new Response(upstream, { headers: { 'content-type': 'application/json' } }),
  response(payload('not JSON')), response(payload('[]')), response(payload('"scalar"')),
  response(payload(content, 'length')), response({ choices: [] }), response({ choices: [payload().choices[0], payload().choices[0]] }),
  response(payload('x'.repeat(129)))]) test('malformed/truncated/untrusted envelope is rejected safely', async () => {
  await rejectsSafe(() => transport(async () => value)(request()));
});
test('announced and chunked response size limits cancel body', async () => {
  let cancelled = 0;
  for (const header of [String(limits.responseBytes + 1), 'invalid', null]) {
    const stream = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode(upstream.repeat(200))); }, cancel() { cancelled++; } });
    const headers = { 'content-type': 'application/json', ...(header === null ? {} : { 'content-length': header }) };
    await rejectsSafe(() => transport(async () => new Response(stream, { headers }))(request()), 'RESPONSE_LIMIT');
  }
  assert.equal(cancelled, 3);
});
test('invalid UTF8 cannot reach output', async () => {
  await rejectsSafe(() => transport(async () => new Response(new Uint8Array([0xff, 0xfe]), { headers: { 'content-type': 'application/json' } }))(request()));
});
test('deadline includes stalled response body and cancels its reader', async () => {
  let cancelled = false;
  const stream = new ReadableStream({ cancel() { cancelled = true; } });
  const run = transport(async () => new Response(stream, { headers: { 'content-type': 'application/json' } }), { timeoutMs: 10 });
  await rejectsSafe(() => run(request()), 'TIMEOUT'); assert.equal(cancelled, true);
});
