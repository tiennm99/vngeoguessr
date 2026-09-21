import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, afterEach } from 'vitest';
import { parseEnv, loadEnvFile, applyEnvFile } from '../scripts/lib/env.mjs';

// The four offline pipeline scripts (build-pano-index, build-region-boundaries
// via seed-pano-db and friends) used to each carry their own copy of this
// parser. One of the copies had drifted -- it never stripped the quotes
// `vercel env pull` wraps values in -- so this pins the shared parser's rules
// directly, from text, rather than exercising it through any one script.

describe('parseEnv', () => {
  it('parses simple key=value pairs', () => {
    expect(parseEnv('FOO=bar\nBAZ=qux')).toEqual({ FOO: 'bar', BAZ: 'qux' });
  });

  it('strips a `vercel env pull`-style quoted value', () => {
    expect(parseEnv('DATABASE_URL="postgres://example.test/db"')).toEqual({
      DATABASE_URL: 'postgres://example.test/db',
    });
  });

  it('keeps an unquoted value with embedded quotes as-is', () => {
    expect(parseEnv('TOKEN=abc"def')).toEqual({ TOKEN: 'abc"def' });
  });

  it('skips comments and blank lines', () => {
    expect(parseEnv('# a comment\n\nFOO=bar\n  \n# another\nBAZ=qux')).toEqual({
      FOO: 'bar',
      BAZ: 'qux',
    });
  });

  it('splits only on the first `=`, keeping the rest in the value', () => {
    expect(parseEnv('CONN_STR=postgres://user:pass@host/db?a=1&b=2')).toEqual({
      CONN_STR: 'postgres://user:pass@host/db?a=1&b=2',
    });
  });

  it('trims surrounding whitespace around key and value', () => {
    expect(parseEnv('  FOO  =  bar  ')).toEqual({ FOO: 'bar' });
  });

  it('ignores a line with no `=`', () => {
    expect(parseEnv('FOO=bar\nnot-a-line\nBAZ=qux')).toEqual({ FOO: 'bar', BAZ: 'qux' });
  });

  it('handles CRLF line endings', () => {
    expect(parseEnv('FOO=bar\r\nBAZ=qux\r\n')).toEqual({ FOO: 'bar', BAZ: 'qux' });
  });

  it('returns {} for empty text', () => {
    expect(parseEnv('')).toEqual({});
  });
});

describe('loadEnvFile', () => {
  let dir;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it('reads and parses an existing file', () => {
    dir = mkdtempSync(join(tmpdir(), 'vngeoguessr-env-test-'));
    const path = join(dir, '.env');
    writeFileSync(path, 'MAPILLARY_ACCESS_TOKEN="secret-token"\n# comment\nEMPTY_OK=\n');
    expect(loadEnvFile(path)).toEqual({ MAPILLARY_ACCESS_TOKEN: 'secret-token', EMPTY_OK: '' });
  });

  it('returns {} when the file does not exist', () => {
    dir = mkdtempSync(join(tmpdir(), 'vngeoguessr-env-test-'));
    expect(loadEnvFile(join(dir, 'missing.env'))).toEqual({});
  });
});

describe('applyEnvFile', () => {
  const KEY = 'VNGEOGUESSR_TEST_ENV_VAR';
  let dir;

  afterEach(() => {
    delete process.env[KEY];
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it('sets a variable from the file when unset in the environment', () => {
    dir = mkdtempSync(join(tmpdir(), 'vngeoguessr-env-test-'));
    const path = join(dir, '.env');
    writeFileSync(path, `${KEY}=from-file\n`);
    delete process.env[KEY];
    applyEnvFile(path);
    expect(process.env[KEY]).toBe('from-file');
  });

  it('does not override a variable the environment already set', () => {
    dir = mkdtempSync(join(tmpdir(), 'vngeoguessr-env-test-'));
    const path = join(dir, '.env');
    writeFileSync(path, `${KEY}=from-file\n`);
    process.env[KEY] = 'from-environment';
    applyEnvFile(path);
    expect(process.env[KEY]).toBe('from-environment');
  });

  it('is a no-op when the file is missing', () => {
    dir = mkdtempSync(join(tmpdir(), 'vngeoguessr-env-test-'));
    delete process.env[KEY];
    expect(() => applyEnvFile(join(dir, 'missing.env'))).not.toThrow();
    expect(process.env[KEY]).toBeUndefined();
  });
});
