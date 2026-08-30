// Production build for local verification, into its own output directory.
//
// `next dev` and `next build` both own `.next`. Building while a dev server is
// serving makes that server read manifests the build has just replaced, which
// surfaces as a burst of ENOENT errors on files like
// `.next/server/app/page/app-build-manifest.json`. Measured: 110 such errors in
// one run, and none when the two do not overlap.
//
// The `build` script is left exactly as it is, because that is what the
// deployment platform runs and it must keep writing to `.next`.
//
//   npm run build:check

import { spawn } from 'node:child_process';

const child = spawn('npx', ['next', 'build'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, NEXT_DIST_DIR: '.next-check' },
});

child.on('exit', (code) => process.exit(code ?? 1));
