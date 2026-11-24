import { describe, expect, it } from 'vitest';
import { formatFilename, formatBytes, isLocalUrl, sanitizeFilename } from './format';

describe('formatFilename', () => {
  const date = new Date(2026, 10, 23, 14, 5, 9);

  it('expands all supported tokens', () => {
    expect(formatFilename('Shot_{yyyy}-{MM}-{dd}_{HH}-{mm}-{ss}', { date })).toBe(
      'Shot_2026-11-23_14-05-09'
    );
  });

  it('supports a counter and fallback name', () => {
    expect(formatFilename('Shot_{counter}', { date, counter: 7 })).toBe('Shot_7');
    expect(formatFilename('', { date })).toBe('Snapleaf');
  });

  it('strips invalid Windows characters', () => {
    expect(sanitizeFilename('a<b>c:d"e/f\\g|h?i*j')).toBe('a_b_c_d_e_f_g_h_i_j');
  });
});

describe('formatBytes', () => {
  it('formats common sizes', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
  });
});

describe('isLocalUrl', () => {
  it('recognises loopback and private network links', () => {
    expect(isLocalUrl('http://127.0.0.1:38473/p/abc')).toBe(true);
    expect(isLocalUrl('http://192.168.1.4:38473/p/abc')).toBe(true);
    expect(isLocalUrl('http://10.0.0.8:38473/p/abc')).toBe(true);
    expect(isLocalUrl('https://shots.example.com/p/abc')).toBe(false);
  });
});
