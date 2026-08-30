// Shared barrel emitter for the two generated import barrels:
// src/data/boundaries/index.js (scripts/build-region-boundaries.mjs) and
// src/data/panos/index.js (scripts/build-pano-index.mjs).
//
// Both rewrite the same shape from whatever is actually on disk -- a header
// comment, one sanitised import per entry, then an export map keyed by region
// code -- so a partial build still compiles. One copy, because the identifier
// sanitiser is the kind of detail that drifts silently when it lives in two
// places.

import { readdirSync, writeFileSync } from 'node:fs';

/**
 * A JS identifier safe to use in a generated import.
 *
 * Region codes are hyphenated (TPHCM-Q7), and a hyphen is legal in a filename
 * but not in a bare identifier or an unquoted object key. Without this the
 * generated barrel is a syntax error and nothing in the app compiles.
 * @param {string} file Filename, with or without extension.
 * @returns {string} Identifier.
 */
export function identFor(file) {
  return file.replace(/\.json$/, '').replace(/[^a-z0-9]/gi, '_');
}

/**
 * Entries for the boundary barrel: every polygon actually on disk.
 *
 * Boundaries are grouped by province, so this walks one level of
 * subdirectories rather than the flat listing the panorama barrel uses.
 * @param {string} dir src/data/boundaries.
 * @returns {Array<{code: string, ident: string, file: string}>} Entries.
 */
export function boundaryEntries(dir) {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) =>
      readdirSync(`${dir}/${entry.name}`)
        .filter((name) => name.endsWith('.json'))
        .map((name) => `${entry.name}/${name}`)
    )
    .sort()
    .map((file) => ({
      code: file.split('/').pop().replace(/\.json$/, '').toUpperCase(),
      ident: identFor(file.split('/').pop()),
      file,
    }));
}

/**
 * Entries for the panorama index barrel: every province index actually on
 * disk, one file per province directly under `dir`.
 * @param {string} dir src/data/panos.
 * @returns {Array<{code: string, ident: string, file: string}>} Entries.
 */
export function panoEntries(dir) {
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => ({
      code: name.replace(/\.json$/, '').toUpperCase(),
      ident: identFor(name),
      file: name,
    }));
}

/**
 * Render one generated barrel module's contents.
 * @param {string} header Full header comment block, ending in a blank line.
 * @param {string} exportName Name of the exported map, e.g. 'REGION_BOUNDARIES'.
 * @param {Array<{code: string, ident: string, file: string}>} entries Entries
 *   to import and export, already in the order they should appear.
 * @returns {string} File contents, ready to write.
 */
export function renderBarrel(header, exportName, entries) {
  return (
    header +
    entries.map((e) => `import ${e.ident} from './${e.file}';`).join('\n') +
    `\n\nexport const ${exportName} = {\n` +
    entries.map((e) => `  ${JSON.stringify(e.code)}: ${e.ident},`).join('\n') +
    '\n};\n'
  );
}

/**
 * Render and write one generated barrel module.
 * @param {string} path Output file path.
 * @param {string} header Full header comment block, ending in a blank line.
 * @param {string} exportName Name of the exported map.
 * @param {Array<{code: string, ident: string, file: string}>} entries Entries.
 * @returns {string[]} Codes now in the barrel.
 */
export function writeBarrelFile(path, header, exportName, entries) {
  writeFileSync(path, renderBarrel(header, exportName, entries));
  return entries.map((e) => e.code);
}
