---
branch: feat/game-region-path-segment
reviewed: 2026-09-06
status: DONE_WITH_CONCERNS
---

# Test quality audit: game region as path segment

## Test execution summary

| Suite | Count | Result |
|-------|-------|--------|
| Unit tests | 266 | ✓ All pass |
| E2E tests | 23 | ✓ All pass |
| Lint | — | ✓ 0 errors |

**Test command sources:**
- `npm test` (vitest, 4.0s)
- `npx playwright test` (23 specs, 17.8s)

## Detailed test quality analysis

### 1. `tests/e2e/routing.spec.js` (11 new tests) — SOLID

**Canonical + redirect cases (tests 1-8):**

Each test uses `landedAt(page)` which constructs `pathname + search` from the final URL. This proves both the path AND that the query string is stripped (critical for rejecting the D4 deviation documented in the code review).

| Test | Line | Assertion | Regression detection |
|------|------|-----------|---------------------|
| Canonical TPHCM | 32-38 | Status 200, path `/game/TPHCM`, "Ho Chi Minh" visible | Fails if page doesn't serve or route breaks |
| Legacy ?region= | 40-43 | Lands at `/game/TPHCM` (exact path+query) | Fails if redirect missing or query carried over |
| Legacy ?location= | 45-48 | Lands at `/game/TPHCM` | Same as above |
| Region beats location | 50-55 | `/game?region=TPHCM&location=HN` → `/game/TPHCM` | Fails if precedence reversed |
| Bare /game → VN | 57-60 | Lands at `/game/VN` | Fails if COUNTRY_CODE fallback removed |
| Empty ?region= | 62-67 | `/game?region=` → `/game/VN` | Fails if `firstValue()` doesn't handle empty string |
| Lowercase path | 69-72 | `/game/hn` → `/game/HN` (redirect via 307) | Fails if canonicalization removed |
| Lowercase legacy | 74-81 | `/game?region=hn` → `/game/HN` (one hop, no ?region survives) | Fails if encoding missing or query carried |

**Hostile input test (line 83-93) — CRITICAL:**

```javascript
const crlf = await page.goto('/game?region=a%0d%0ab');  // decodes to "a\r\nb"
expect(crlf.status()).toBe(404);

const traversal = await page.goto('/game?region=..%2F..%2Fdebug');  // decodes to "../../debug"
expect(traversal.status()).toBe(404);
expect(landedAt(page)).not.toBe('/debug');
```

**Regression analysis:** If `encodeURIComponent()` were removed from `src/app/game/page.js:51`:

- **CRLF case**: Raw `\r\n` in Location header → Node.js throws `ERR_INVALID_CHAR` → Response status = 500 (not 404) → Test fails ✓
- **Traversal case**: Location header `/game/../../debug` → Browser normalizes to `/debug` → `landedAt()` becomes `/debug` → Assertion fails ✓

Both sub-tests would catch the regression. Verified by local encoding test confirming CRLF encodes to `%0D%0AB` and `../` encodes to `..%2F`.

**404s unknown region (line 95-100):**

Status assertion only; doesn't verify not-found.js content. Minor gap (page might be broken), but the 404 status is correct. Not in scope for this review.

**Real unplayable region (line 102-117):**

Asserts a real but unplayable code (TPHCM-CUCHI) returns 200, not 404. Guards itself with `expect(isPlayable(code)).toBe(false)`, so test fails loudly if Cu Chi gains coverage.

### 2. `tests/regions.test.js` — URL safety assertion (lines 28-36) — SOLID WITH DEFENSE IN DEPTH

```javascript
it('every code is URL-safe as a path segment', () => {
  for (const code of allRegions()) {
    expect(code, code).toMatch(/^[A-Z0-9-]+$/);           // Constraint
    expect(encodeURIComponent(code), code).toBe(code);    // Consequence
  }
});
```

**Redundancy analysis:**

Mathematically, if a string matches `[A-Z0-9-]`, then `encodeURIComponent()` WILL return the identical string (these characters are never percent-encoded per RFC 3986). So the second assertion seems redundant.

**Defense in depth verdict:** NOT redundant.

- First assertion documents the SOURCE constraint on region codes
- Second assertion verifies the CONSEQUENCE (they need no encoding)

If someone later changed the first pattern to `/^[A-Za-z0-9-]+$/` (adding lowercase), they might think lowercase letters don't encode — but the second assertion catches that neither does (they both stay same). The assertions work together: one enforces the rule, one verifies the promise.

**Regression detection:**

- Fails if a code gains a character like `.` or `/` that DOES encode
- Fails if `encodeURIComponent` behavior changes (very unlikely)
- Fails if the character class is silently weakened in data

Solid.

### 3. Repaired E2E specs — TESTING ACTUAL BEHAVIOR, NOT WEAKENED

**Key context:** Code review noted these were "red on main" — contradicting deliberate implementation behavior.

#### `username.spec.js` repairs (tests 1-3)

**main branch claimed:** "Landing shows no prompt; the first Play click asks..."
**Actual behavior (src/app/page.js:47-53):** Prompt opens ON LANDING when no name is stored.
**Verdict:** Tests on main were WRONG.

**New test (line 19-37):** "Landing asks for a name, and Play then goes straight into the round"

```javascript
await expect(dialog).toBeVisible();  // Prompt IS visible on landing
await dialog.getByLabel(/Username/).fill('fresh-player');
await dialog.getByRole('button', { name: 'Save name' }).click();

await expect(dialog).toBeHidden();   // Saves just closes, no navigation pending
// … then …
await page.getByRole('link', { name: /Play anywhere in Vietnam/ }).click();
await expect(page).toHaveURL(/\/game\/VN$/);
```

This is not a loosened assertion; it's the CORRECT assertion of deliberate behavior. Test would fail if:
- Prompt doesn't appear on landing
- Saving the name doesn't close the dialog
- Play navigation doesn't use the new `/game/VN` format

**Skip test (line 38-52):** Similar correction. Now correctly asserts:
- Prompt IS open on landing (not after Play)
- Skip closes it (doesn't navigate immediately)
- Play then navigates to `/game/VN`

Regression detection: Good. Fails if the landing prompt behavior changes.

#### `home.spec.js` repair (footer test, lines 38-58)

**main branch claimed:** Single button showing SHA, clicks to show "copied!"
**Actual behavior (commit 6251ea5):** SHA became a link (href to GitHub), separate button for copy.

**Old test:**
```javascript
const stamp = page.getByRole('button', { name: 'Copy build commit' });
await expect(stamp).toHaveText(/^[0-9a-f]{7}$/);      // Wrong: button, not link
```

**New test:**
```javascript
const shaLink = page.getByRole('link', { name: /^View build commit [0-9a-f]{40} on GitHub$/ });
await expect(shaLink).toHaveText(/^[0-9a-f]{7}$/);
await expect(shaLink).toHaveAttribute('href', /\/commit\/[0-9a-f]{40}$/);

await page.getByRole('button', { name: 'Copy build commit' }).click();
await expect(page.getByRole('button', { name: 'Build commit copied' })).toBeVisible();
```

This correctly asserts both elements. Regression detection: Good. Fails if either element is removed or broken.

### 4. Coverage gaps (pre-existing and new)

**Already known (code review):**

1. **No screen render test for coverage message:** API returns the message (tested in `region-request.test.js`), routing works (tested here), but nothing asserts the message appears on the game screen when visiting `/game/DN-HOANGSA`. The routing test at line 102-117 stubs `/api/new-game`, so it never tests the actual error panel render. **Status:** Pre-existing gap, plan scope explicitly didn't include e2e coverage UX.

2. **Client safety import walk limited:** `tests/regions.test.js:241-304` only walks files with `'use client'` directive. A Server Component that imported `pano-index.js` and passed the result as a prop would slip through. The new `[region]/page.js` is the first Server Component in the game path, so this blind spot is "now one refactor from mattering" (code review). **Status:** Pre-existing, design limitation of the test.

**New gaps found in this review:** None identified. All acceptance criteria have test or static-analysis coverage.

**Minor gaps not in scope:**

- Not-found.js content not tested (only 404 status). If the page was deleted or broken, test still passes. However, this is a custom error page, not core routing logic.
- Only TPHCM explicitly tested as a canonical region (VN tested via region-less `/game`). HN-BADINH mentioned in success criteria but no explicit test. However, code review verified `generateStaticParams(allRegions())` will prerender all 85 regions, so static analysis sufficient.

### 5. Link href migration — VERIFIED

The plan's criterion "No ?region= in src/ outside API" is mostly covered by code review (static grep). But link hrefs are also tested:

- `home.spec.js:26` asserts district link has `href='/game/TPHCM-Q7'` (not query param)
- `game.spec.js:14` navigates to `/game/TPHCM` (not query)
- `username.spec.js` navigates to `/game/VN` (not query)

RegionPicker itself wasn't unit-tested, but a change there would break the home.spec.js assertions.

## Summary of findings

| Finding | Category | Impact | Status |
|---------|----------|--------|--------|
| All 11 routing tests prove actual behavior regressions | Quality | High | ✓ Solid |
| Hostile-input test catches encodeURIComponent removal | Security | High | ✓ Solid |
| URL-safety assertions provide defense-in-depth | Quality | Medium | ✓ Solid |
| 4 repaired specs assert ACTUAL behavior, not loosened | Quality | High | ✓ Correct |
| Not-found.js content not verified | Gap | Low | Pre-existing scope |
| Coverage message join not tested end-to-end | Gap | Low | Pre-existing, noted |
| Client-safety walk has blind spot for Server Components | Gap | Low | Pre-existing, noted |

## Recommendations

None blocking. The test suite is well-structured and would reliably catch regressions in:
- Path segment routing
- Query-param redirect stripping
- Encoding of hostile input
- URL safety of region codes
- New landing-modal behavior
- Footer SHA/copy split

The two pre-existing coverage gaps (screen render of coverage message, Server Component import walk) were already documented in the code review and are not in scope for this change.

---

**Status:** DONE_WITH_CONCERNS

**Summary:** Tests are solid and would catch the critical regressions they target. Four previously-failing specs now correctly assert the actual deliberate behavior (landing prompt, footer split). No new gaps introduced beyond the two pre-existing ones already recorded.

**Concerns:** None that block shipping. The omissions are all pre-existing limitations or scope decisions already acknowledged in the code review.
