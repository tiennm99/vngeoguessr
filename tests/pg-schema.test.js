import { describe, it, expect, afterEach, vi } from 'vitest';
vi.mock('@neondatabase/serverless', async () => {
  const { neonModule } = await import('./mock-neon.js');
  return neonModule();
});

import { resolvePgSchema, DEFAULT_PG_SCHEMA } from '../src/lib/pg-schema.js';
import { panoTable } from '../src/lib/pano-db.js';

// The schema name is interpolated into SQL as an identifier, so the resolver
// is the only thing standing between PG_SCHEMA and the query text. These pin
// its rules directly; tests/pano-index.test.js covers the qualified queries.

describe('resolvePgSchema', () => {
  it('defaults to vngeoguessr when unset', () => {
    expect(DEFAULT_PG_SCHEMA).toBe('vngeoguessr');
    expect(resolvePgSchema(undefined)).toBe('vngeoguessr');
  });

  it('treats an empty value as unset', () => {
    expect(resolvePgSchema('')).toBe('vngeoguessr');
  });

  it('accepts an override', () => {
    expect(resolvePgSchema('vngeoguessr_staging')).toBe('vngeoguessr_staging');
    expect(resolvePgSchema('_x9')).toBe('_x9');
  });

  it('rejects anything that is not a plain lowercase identifier', () => {
    for (const bad of [
      'public; DROP TABLE x',
      'Vngeoguessr',
      '9lives',
      'vn-geo',
      'a.b',
      '"quoted"',
      ' vngeoguessr',
      'a'.repeat(64),
    ]) {
      expect(() => resolvePgSchema(bad), bad).toThrow(/PG_SCHEMA/);
    }
  });

  it('rejects reserved keywords Postgres refuses as an unquoted schema', () => {
    for (const bad of ['user', 'select', 'all', 'order', 'table', 'current_schema', 'join']) {
      expect(() => resolvePgSchema(bad), bad).toThrow(/reserved Postgres keyword/);
    }
  });

  it('rejects shared and system schemas', () => {
    for (const bad of ['public', 'information_schema', 'pg_catalog', 'pg_toast', 'pg_vn']) {
      expect(() => resolvePgSchema(bad), bad).toThrow(/schema of its own/);
    }
  });

  it('accepts names that only contain a reserved word or prefix', () => {
    expect(resolvePgSchema('users')).toBe('users');
    expect(resolvePgSchema('public_vn')).toBe('public_vn');
    expect(resolvePgSchema('pgvn')).toBe('pgvn');
  });

  it('accepts the longest name Postgres keeps intact', () => {
    expect(resolvePgSchema('a'.repeat(63))).toBe('a'.repeat(63));
  });
});

describe('panoTable', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('qualifies with the default schema', () => {
    vi.stubEnv('PG_SCHEMA', '');
    expect(panoTable('panoramas')).toBe('vngeoguessr.panoramas');
  });

  it('follows PG_SCHEMA', () => {
    vi.stubEnv('PG_SCHEMA', 'other_tenant');
    expect(panoTable('pano_provinces')).toBe('other_tenant.pano_provinces');
  });

  it('refuses an invalid PG_SCHEMA before any SQL is built', () => {
    vi.stubEnv('PG_SCHEMA', 'x;--');
    expect(() => panoTable('panoramas')).toThrow(/PG_SCHEMA/);
  });
});
