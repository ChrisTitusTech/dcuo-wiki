import test from "node:test";
import assert from "node:assert/strict";
import { catalogFetch } from "../scripts/catalog-network.mjs";

const failure = (code) =>
  new TypeError("fetch failed", {
    cause: Object.assign(new Error(), { code }),
  });

test("connection timeouts repeatedly wait five minutes then resume the same request", async () => {
  const waits = [],
    logs = [],
    signals = [];
  let calls = 0;
  const response = { ok: true };
  assert.equal(
    await catalogFetch(
      "https://example.test/job",
      { method: "GET" },
      {
        fetchImpl: async (url, options) => {
          assert.equal(url, "https://example.test/job");
          signals.push(options.signal);
          if (++calls < 3) throw failure("UND_ERR_CONNECT_TIMEOUT");
          return response;
        },
        sleep: async (ms) => waits.push(ms),
        log: (line) => logs.push(JSON.parse(line)),
      },
    ),
    response,
  );
  assert.deepEqual(waits, [300000, 300000]);
  assert.deepEqual(
    logs.map((row) => row.retry),
    [1, 2],
  );
  assert.ok(logs.every((row) => row.retryAfterSeconds === 300));
  assert.equal(new Set(signals).size, 3);
});

test("polling retries connection resets and request timeouts", async () => {
  for (const error of [
    failure("ECONNRESET"),
    new DOMException("timeout", "TimeoutError"),
  ]) {
    let calls = 0;
    const waits = [];
    await catalogFetch(
      "https://example.test/job",
      { method: "GET" },
      {
        fetchImpl: async () => {
          if (++calls === 1) throw error;
          return {};
        },
        sleep: async (ms) => waits.push(ms),
        log: () => {},
      },
    );
    assert.equal(calls, 2);
    assert.deepEqual(waits, [300000]);
  }
});

test("submissions retry a failed connection without changing the payload", async () => {
  let calls = 0;
  const waits = [];
  await catalogFetch(
    "https://example.test/job",
    { method: "POST", body: "payload" },
    {
      fetchImpl: async (_, options) => {
        assert.equal(options.body, "payload");
        if (++calls === 1) throw failure("UND_ERR_CONNECT_TIMEOUT");
        return {};
      },
      sleep: async (ms) => waits.push(ms),
      log: () => {},
    },
  );
  assert.deepEqual(waits, [300000]);
});

test("ambiguous submissions and non-network errors stop without retrying", async () => {
  for (const [method, error] of [
    ["POST", failure("ECONNRESET")],
    ["POST", new DOMException("timeout", "TimeoutError")],
    ["GET", new TypeError("invalid request")],
  ]) {
    await assert.rejects(
      catalogFetch(
        "https://example.test/job",
        { method },
        {
          fetchImpl: async () => {
            throw error;
          },
          sleep: async () => assert.fail("unexpected retry"),
          log: () => {},
        },
      ),
      (actual) => actual === error,
    );
  }
});

test("HTTP responses are returned to the existing status retry policy", async () => {
  const response = { status: 503 };
  assert.equal(
    await catalogFetch(
      "https://example.test/job",
      { method: "GET" },
      {
        fetchImpl: async () => response,
        sleep: async () => assert.fail("unexpected network retry"),
      },
    ),
    response,
  );
});
