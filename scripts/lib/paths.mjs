// Absolute paths to the generated data directories, shared by every script
// that reads or writes them.
//
// Resolved from this file's own location rather than the process's cwd. npm
// always runs scripts from the project root anyway, but `node
// scripts/whatever.mjs` from an unexpected directory would otherwise silently
// read or write the wrong tree instead of failing loudly.

import { fileURLToPath } from 'node:url';

export const BOUNDARY_DIR = fileURLToPath(new URL('../../src/data/boundaries', import.meta.url));
// Local pipeline artifacts, not committed and not bundled: the app reads
// panoramas from Postgres, seeded from these files by seed-pano-db.mjs.
export const PANO_DIR = fileURLToPath(new URL('../../data-build/panos', import.meta.url));
export const TREE_DIR = fileURLToPath(new URL('../../src/data/regions', import.meta.url));
