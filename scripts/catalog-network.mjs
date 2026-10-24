import { setTimeout as delay } from "node:timers/promises";

const connectionErrors = new Set([
  "UND_ERR_CONNECT_TIMEOUT",
  "ECONNREFUSED",
  "ENOTFOUND",
  "EAI_AGAIN",
]);
const transportErrors = new Set([
  ...connectionErrors,
  "ECONNRESET",
  "EPIPE",
  "ETIMEDOUT",
  "UND_ERR_SOCKET",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
]);

// Polling is safe to repeat. A submission is safe only if it never connected;
// retrying an ambiguous POST could create another paid batch.
export async function catalogFetch(
  url,
  options,
  { fetchImpl = fetch, sleep = delay, log = console.log } = {},
) {
  let retries = 0;
  const wait = async (reason) => {
    log(
      JSON.stringify({
        status: "network-retry",
        reason,
        retry: ++retries,
        retryAfterSeconds: 300,
        retryAt: new Date(Date.now() + 300000).toISOString(),
      }),
    );
    await sleep(300000);
  };
  for (;;) {
    try {
      const response = await fetchImpl(url, {
        ...options,
        signal: AbortSignal.timeout(60000),
      });
      if (
        response.status === 429 ||
        (options.method !== "POST" && response.status >= 500)
      ) {
        await response.body?.cancel();
        await wait("HTTP_" + response.status);
        continue;
      }
      return response;
    } catch (error) {
      const code = error.cause?.code || error.code;
      const submission = options.method === "POST";
      const retryable = submission
        ? connectionErrors.has(code)
        : transportErrors.has(code) || error.name === "TimeoutError";
      if (!retryable) throw error;
      await wait(code || error.name);
    }
  }
}
