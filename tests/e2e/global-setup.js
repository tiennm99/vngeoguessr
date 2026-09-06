// Warms the dev server's heavy routes before any worker runs.
//
// `next dev` compiles a route on its first request. The game routes are the
// expensive ones, and 8 parallel workers otherwise all demand that same cold
// compile at once, each waiting behind it -- every test that navigates to a
// /game URL then fails together at the 60s timeout. Reproducible on demand:
// touch a source file (invalidating the compile cache) and run the suite.
//
// One serial pass over the three route shapes pays the compile once. A warm
// server, or a production one, makes these near-instant no-ops.
export default async function globalSetup(config) {
  const { baseURL } = config.projects[0].use;

  // One per compiled route: the prerendered region page, the dynamic legacy
  // redirect, and the not-found path through the [region] segment.
  const routes = ['/', '/game/tphcm', '/game?region=TPHCM', '/game/notaregion'];

  for (const route of routes) {
    try {
      // Bounded: a wedged compile would otherwise hang here forever, and
      // Playwright's globalTimeout is 0, so the run would stall with no output.
      await fetch(new URL(route, baseURL), {
        redirect: 'follow',
        signal: AbortSignal.timeout(60_000),
      });
    } catch (error) {
      // A warm-up is an optimisation, never a gate: if the server is not
      // answering, the specs' own waits and retries still apply, and their
      // failure messages say far more than one thrown here would. Only a
      // network-level failure lands here -- fetch resolves on any HTTP status,
      // so a 404 or a 500 is a successful warm-up, not a miss.
      //
      // Said out loud, because a skipped warm-up looks exactly like the flake
      // it exists to prevent: 8 game-route tests timing out together.
      console.warn(`[global-setup] warm-up of ${route} failed: ${error.message}`);
    }
  }
}
