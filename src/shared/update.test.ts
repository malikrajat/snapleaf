import { describe, expect, it } from 'vitest';
import { isNewerVersion, normalizeVersion, parseUpdateManifest } from './update';

describe('update manifest', () => {
  it('compares semantic versions numerically', () => {
    expect(isNewerVersion('0.1.1', '0.1.0')).toBe(true);
    expect(isNewerVersion('0.2', '0.1.9')).toBe(true);
    expect(isNewerVersion('1.0.0', '0.9.9')).toBe(true);
    expect(isNewerVersion('0.1.0', '0.1.0')).toBe(false);
    expect(isNewerVersion('0.0.9', '0.1.0')).toBe(false);
    expect(normalizeVersion('v0.2.0')).toBe('0.2.0');
  });

  it('accepts a Snapleaf manifest', () => {
    const update = parseUpdateManifest(
      {
        version: '0.2.0',
        downloadUrl: 'https://rajatmalik.dev/snapleaf/Snapleaf-0.2.0-Setup.exe',
        notes: 'Numbered steps and a faster editor.',
        publishedAt: '2026-12-01T10:00:00Z'
      },
      '0.1.0'
    );
    expect(update).toMatchObject({
      version: '0.2.0',
      currentVersion: '0.1.0',
      notes: 'Numbered steps and a faster editor.',
      publishedAt: '2026-12-01T10:00:00Z'
    });
    expect(update?.downloadUrl).toContain('Snapleaf-0.2.0-Setup.exe');
  });

  it('accepts a GitHub latest-release payload', () => {
    const update = parseUpdateManifest(
      {
        tag_name: 'v1.4.0',
        html_url: 'https://github.com/malikrajat/snapleaf/releases/tag/v1.4.0',
        body: 'Release notes',
        published_at: '2026-12-02T10:00:00Z'
      },
      '1.3.0'
    );
    expect(update?.version).toBe('1.4.0');
    expect(update?.downloadUrl).toContain('/releases/tag/v1.4.0');
    expect(update?.notes).toBe('Release notes');
  });

  it('rejects unsafe or incomplete manifests', () => {
    expect(parseUpdateManifest({ version: '0.2.0' }, '0.1.0')).toBeNull();
    expect(
      parseUpdateManifest({ version: '0.2.0', downloadUrl: 'javascript:alert(1)' }, '0.1.0')
    ).toBeNull();
    expect(parseUpdateManifest({ version: 'not-a-version', downloadUrl: 'https://example.com' }, '0.1.0')).toBeNull();
  });
});
