import { describe, it, expect } from 'vitest';
import { buildShareText } from '../src/lib/share.js';

describe('buildShareText', () => {
  it('draws the score as squares and links the region page', () => {
    expect(buildShareText('Ha Noi', 4, '82m', 'https://example.test/game/hn')).toBe(
      'VNGeoGuessr · Ha Noi\n🟩🟩🟩🟩⬜ 4/5 · 82m away\nhttps://example.test/game/hn'
    );
  });

  it('clamps a score outside the ladder', () => {
    expect(buildShareText('Vietnam', 9, '1.20km', 'u')).toContain('🟩🟩🟩🟩🟩 5/5');
    expect(buildShareText('Vietnam', -1, '1.20km', 'u')).toContain('⬜⬜⬜⬜⬜ 0/5');
  });
});
