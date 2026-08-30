// Global setup for the integration run: fail fast and legibly when the local
// Upstash stand-in is not up, rather than letting every test time out.

// globalSetup runs before the config's `env` block reaches the process, so
// these fall back to the values docker-compose.yml serves.
const URL = process.env.UPSTASH_REDIS_REST_URL ?? 'http://localhost:8079';
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN ?? 'vngeoguessr-local-token';
const ATTEMPTS = 20;
const DELAY_MS = 500;

export async function setup() {
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      // A command posted as a JSON array is exactly what the SDK sends, so a
      // PONG here means SRH is up and its Redis connection works. SRH serves
      // only this form, not the path form Upstash also accepts.
      const response = await fetch(URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(['PING']),
      });
      if (response.ok) return;
    } catch {
      // Not listening yet; fall through to the retry.
    }
    await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
  }

  throw new Error(
    `No Upstash-compatible server answered at ${URL} after ${ATTEMPTS} attempts. ` +
      'Start it with `npm run redis:up`.'
  );
}
