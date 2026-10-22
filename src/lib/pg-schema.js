// The Postgres schema holding the panorama tables, shared by the app
// (src/lib/pano-db.js) and the seed script (scripts/seed-pano-db.mjs) so the
// tables one writes are the tables the other reads.
//
// Multi-tenancy, the Postgres counterpart of KEY_PREFIX in upstash.js: the
// Vercel-managed Neon integration locks DATABASE_URL to one database that
// other projects may share, and a full seed drops and renames tables. Keeping
// them in their own schema (PG_SCHEMA, default 'vngeoguessr') means those
// drops and renames can only touch this project's tables.
//
// No secrets and no driver here, so the module is safe to import anywhere.

export const DEFAULT_PG_SCHEMA = 'vngeoguessr';

// Lowercase unquoted identifier, at most 63 bytes (Postgres NAMEDATALEN - 1;
// anything longer is silently truncated, which would point the app and the
// seed at a schema neither named).
const IDENTIFIER = /^[a-z_][a-z0-9_]{0,62}$/;

// Names that match the pattern but still cannot be this schema. The SQL uses
// the name unquoted, and Postgres refuses these keywords as an unquoted schema
// name (its reserved and type/function-name keyword classes). pg_ is reserved
// for system schemas. public and the catalogs are shared with every other
// tenant, so seeding there would drop and rename their tables.
const RESERVED_KEYWORDS = new Set([
  'all', 'analyse', 'analyze', 'and', 'any', 'array', 'as', 'asc',
  'asymmetric', 'authorization', 'binary', 'both', 'case', 'cast', 'check',
  'collate', 'collation', 'column', 'concurrently', 'constraint', 'create',
  'cross', 'current_catalog', 'current_date', 'current_role',
  'current_schema', 'current_time', 'current_timestamp', 'current_user',
  'default', 'deferrable', 'desc', 'distinct', 'do', 'else', 'end', 'except',
  'false', 'fetch', 'for', 'foreign', 'freeze', 'from', 'full', 'grant',
  'group', 'having', 'ilike', 'in', 'initially', 'inner', 'intersect',
  'into', 'is', 'isnull', 'join', 'lateral', 'leading', 'left', 'like',
  'limit', 'localtime', 'localtimestamp', 'natural', 'not', 'notnull',
  'null', 'offset', 'on', 'only', 'or', 'order', 'outer', 'overlaps',
  'placing', 'primary', 'references', 'returning', 'right', 'select',
  'session_user', 'similar', 'some', 'symmetric', 'system_user', 'table',
  'tablesample', 'then', 'to', 'trailing', 'true', 'union', 'unique', 'user',
  'using', 'variadic', 'verbose', 'when', 'where', 'window', 'with',
]);
const SHARED_SCHEMAS = new Set(['public', 'information_schema']);

/**
 * Validate a schema name, falling back to the default when unset.
 *
 * The name is interpolated into SQL as an identifier -- parameters cannot
 * stand in for identifiers -- so anything outside the strict pattern throws
 * rather than reaching a query. So do names Postgres refuses unquoted
 * (reserved keywords, the pg_ prefix) and the shared schemas (public,
 * information_schema), where a full seed would clobber other tenants' tables.
 * Empty counts as unset, like KEY_PREFIX: an empty schema would otherwise fail
 * every query with a syntax error.
 * @param {string|undefined} value Raw PG_SCHEMA value.
 * @returns {string} The schema name to qualify tables with.
 */
export function resolvePgSchema(value) {
  const schema = value || DEFAULT_PG_SCHEMA;
  if (!IDENTIFIER.test(schema)) {
    throw new Error(
      `PG_SCHEMA must be a lowercase Postgres identifier matching ${IDENTIFIER}, got ${JSON.stringify(schema)}`
    );
  }
  if (RESERVED_KEYWORDS.has(schema)) {
    throw new Error(
      `PG_SCHEMA must not be a reserved Postgres keyword, got ${JSON.stringify(schema)}`
    );
  }
  if (schema.startsWith('pg_') || SHARED_SCHEMAS.has(schema)) {
    throw new Error(
      `PG_SCHEMA must name a schema of its own, not public, information_schema or a pg_ system schema, got ${JSON.stringify(schema)}`
    );
  }
  return schema;
}
