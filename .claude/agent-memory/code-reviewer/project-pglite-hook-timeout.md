---
name: project-pglite-hook-timeout
description: Intermittent vitest failures (whole files FAIL, tests skipped) come from PGlite init in beforeAll exceeding the 10s default hookTimeout on the ARM dev box
metadata:
  type: project
---

On the 4-core ARM workspace, `new PGlite()` takes ~7s uncontended (measured 2026-09-28); the 7 test files that call seedPanoFixtures in beforeAll all init it concurrently, so a loaded run exceeds vitest's 10s default hookTimeout. Signature: "N files failed | M skipped", immediate rerun green. CI (GitHub x64) is fast enough to hide it.

**Why:** a file-level beforeAll timeout skips every test in the file, which looks like random flakiness.
**How to apply:** when a report of "files failed, tests skipped, rerun passed" comes in, check hookTimeout in vitest configs first (`npx vitest run --hookTimeout=2500` reproduces deterministically).
