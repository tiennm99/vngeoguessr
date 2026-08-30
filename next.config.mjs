/** @type {import('next').NextConfig} */
const nextConfig = {
  // `next dev` and `next build` both write to the output directory, so a build
  // started while a dev server is serving makes that server read manifests the
  // build has just replaced. Leaving this unset keeps production on `.next`,
  // which is what the deployment platform expects; `npm run build:check` sets
  // it so a local verification build cannot disturb a running dev server.
  distDir: process.env.NEXT_DIST_DIR || '.next',
};

export default nextConfig;
