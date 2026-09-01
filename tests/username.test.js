import { describe, expect, it } from 'vitest';
import { generateRandomUsername } from '../src/lib/username.js';

// The generated name must satisfy the same rules UsernameModal enforces,
// because it is stored and later edited exactly like a typed name.
describe('generateRandomUsername', () => {
  it('produces a name the modal validation accepts', () => {
    for (let i = 0; i < 50; i += 1) {
      const name = generateRandomUsername();
      expect(name.length).toBeGreaterThanOrEqual(2);
      expect(name.length).toBeLessThanOrEqual(20);
      expect(name).toMatch(/^[a-zA-Z0-9_-]+$/);
    }
  });

  it('uses the Player- prefix so generated names are recognisable', () => {
    expect(generateRandomUsername()).toMatch(/^Player-[0-9a-z]{6}$/);
  });
});
