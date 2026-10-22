# TODO

## Isolate the Neon tables in their own Postgres schema

Upstash is already safe to share with other projects through `KEY_PREFIX`.
Neon is not: the panorama tables live in `public` under generic names, and a
full `npm run data:seed` drops `panoramas_next` and `panoramas_old` and
renames `panoramas`, which would clobber a co-tenant's tables of the same name.

A separate Neon database would avoid that, but the Vercel-managed Neon
integration cannot point its locked `DATABASE_URL` at another database without
unlinking and setting the variables by hand. Moving the tables into a schema
keeps the linked `DATABASE_URL` as it is.

- [ ] Qualify every table as `vngeoguessr.<table>` in `src/lib/pano-db.js`,
      `scripts/lib/pano-schema.mjs` and `scripts/seed-pano-db.mjs`, including
      the `panoramas_next` / `panoramas_old` staging tables and the index
      renames. Optional `PG_SCHEMA` env var, defaulting to `vngeoguessr`.
- [ ] Make the seed script run `CREATE SCHEMA IF NOT EXISTS`.
- [ ] Update tests, `.env.example` and `docs/` to match.
- [ ] Back up first (Neon branch snapshot), then move the live tables once,
      right before the new code deploys (or reseed afterwards instead):

      ```sql
      CREATE SCHEMA IF NOT EXISTS vngeoguessr;
      ALTER TABLE public.panoramas      SET SCHEMA vngeoguessr;
      ALTER TABLE public.pano_provinces SET SCHEMA vngeoguessr;
      ```

Other projects sharing the database must stay out of the `vngeoguessr` schema.
Neon storage and compute limits remain shared across the Neon project.

Reference: <https://neon.com/docs/guides/vercel-managed-integration>
