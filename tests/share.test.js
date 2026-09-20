import { describe, it, expect } from 'vitest';
import { buildShareText, buildDailyShareText } from '../src/lib/share.js';

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

describe('buildDailyShareText', () => {
  it('names the challenge and shows a streak once it is worth showing', () => {
    expect(buildDailyShareText(12, 3, '150m', 1, 'https://example.test/daily')).toBe(
      'VNGeoGuessr Daily #12\n🟩🟩🟩⬜⬜ 3/5 · 150m away\nhttps://example.test/daily'
    );
    expect(buildDailyShareText(12, 0, '40.00km', 4, 'u')).toContain('⬜⬜⬜⬜⬜ 0/5 · 40.00km away · 🔥 4 days');
  });
});
