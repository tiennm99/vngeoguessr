import { describe, expect, it } from 'vitest';
import { generateRandomUsername, validateUsername } from '../src/lib/username.js';

// The generated name must satisfy the same rules UsernameModal enforces,
// because it is stored and later edited exactly like a typed name.
describe('generateRandomUsername', () => {
  it('produces a name the modal validation accepts', () => {
    for (let i = 0; i < 50; i += 1) {
      const name = generateRandomUsername();
      expect(name.length).toBeGreaterThanOrEqual(2);
      expect(name.length).toBeLessThanOrEqual(20);
      expect(name).toMatch(/^[a-zA-Z0-9_-]+$/);
      expect(validateUsername(name).ok).toBe(true);
    }
  });

  it('uses the Player- prefix so generated names are recognisable', () => {
    expect(generateRandomUsername()).toMatch(/^Player-[0-9a-z]{6}$/);
  });
});

// One rule for the modal and /api/guess: the browser used to be the only
// validator, so a request built by hand could put any string on the boards.
describe('validateUsername', () => {
  it('trims and accepts an ordinary name', () => {
    expect(validateUsername('  mai_99 ')).toEqual({ ok: true, value: 'mai_99', error: null });
  });

  it('accepts Vietnamese letters', () => {
    expect(validateUsername('Tiến').ok).toBe(true);
    expect(validateUsername('Nguyễn-Văn').ok).toBe(true);
  });

  it.each([
    ['not a string', 123],
    ['empty', '   '],
    ['too short', 'a'],
    ['too long', 'x'.repeat(21)],
    ['a space inside', 'mai le'],
    // ':' is the separator inside distance-board members.
    ['a colon', 'mai:5'],
    ['punctuation', 'mai!'],
  ])('rejects %s', (_label, raw) => {
    const result = validateUsername(raw);
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });
});
