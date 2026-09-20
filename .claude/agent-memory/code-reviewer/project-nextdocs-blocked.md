---
name: nextdocs-blocked
description: node_modules is hook-blocked for Read and Bash here, so the CLAUDE.md instruction to read node_modules/next/dist/docs/ cannot be followed; use nextjs.org instead.
metadata:
  type: project
---

`node_modules/**` is denied by `/config/.claude/hooks/scout-block.cjs` for both Read and Bash in this
project, so the root CLAUDE.md instruction to consult `node_modules/next/dist/docs/` before judging Next
conventions is not executable as written.

**Why:** the scout-block hook trims context by refusing node_modules paths; the Next-version warning block
in CLAUDE.md is auto-written by `next dev` and predates that hook.

**How to apply:** when a review turns on a Next 16 convention, fetch the versioned page from nextjs.org
(the docs header states the version, e.g. 16.3.5) and say in the report that the bundled docs were
unreadable. Known result so far: Next 16 deprecates `middleware.js` in favour of `proxy.js` exporting
`proxy`, root or `src/`. See [[project-quality-gates-blind-spots]].
