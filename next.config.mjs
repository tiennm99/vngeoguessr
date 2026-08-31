import { execSync } from 'node:child_process';

// The commit this build was made from, for the debug footer on every page.
// The FULL sha: the footer shows the short form but copies this, so what
// lands in the clipboard is directly usable with git. Vercel's build
// container has no .git directory but provides the sha in an env var; local
// builds ask git; anything else shows 'unknown' rather than failing the
// build over a label.
function resolveCommitSha() {
  const fromPlatform = process.env.VERCEL_GIT_COMMIT_SHA;
  if (fromPlatform) return fromPlatform;
  try {
    return execSync('git rev-parse HEAD', {
      stdio: ['ignore', 'pipe', 'ignore'],
    }).toString().trim();
  } catch {
    return 'unknown';
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_COMMIT_SHA: resolveCommitSha(),
  },
  // `next dev` and `next build` both write to the output directory, so a build
  // started while a dev server is serving makes that server read manifests the
  // build has just replaced. Leaving this unset keeps production on `.next`,
  // which is what the deployment platform expects; `npm run build:check` sets
  // it so a local verification build cannot disturb a running dev server.
  distDir: process.env.NEXT_DIST_DIR || '.next',
};

export default nextConfig;
