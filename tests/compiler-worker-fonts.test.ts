import { describe, it, expect } from 'vitest';
import { annotateUncuratedResolution } from '../playground/services/compiler-worker';
import type { FontBinaryEntry } from '../playground/services/font-loader';

const binary = (family: string, weight = 400): FontBinaryEntry => ({
  family,
  weight,
  style: 'normal',
  buffer: new ArrayBuffer(4),
});

describe('annotateUncuratedResolution', () => {
  it('emits the curated-list notice for an uncurated family that loaded', () => {
    const { notices, failures } = annotateUncuratedResolution(
      { binaries: [binary('Gravitas One')], failures: [] },
      new Set(['Gravitas One']),
    );
    expect(notices).toEqual([
      '"Gravitas One" is not in the curated font list; loaded directly from Google Fonts.',
    ]);
    expect(failures).toEqual([]);
  });

  it('emits no notice for an uncurated family that failed to load', () => {
    const { notices } = annotateUncuratedResolution(
      { binaries: [], failures: [{ family: 'MadeUpName', weight: 400, reason: 'Failed to fetch' }] },
      new Set(['MadeUpName']),
    );
    expect(notices).toEqual([]);
  });

  it('rewrites uncurated failure reasons to the probe message, preserving the raw reason', () => {
    const { failures } = annotateUncuratedResolution(
      { binaries: [], failures: [{ family: 'MadeUpName', weight: 400, reason: 'Failed to fetch' }] },
      new Set(['MadeUpName']),
    );
    expect(failures).toHaveLength(1);
    expect(failures[0].reason).toBe(
      'Could not load "MadeUpName" from Google Fonts — the font was not found, ' +
        'or the network request failed. Check the spelling against fonts.google.com, ' +
        'or open the font picker for the curated list. (Failed to fetch)',
    );
  });

  it('leaves curated-family failures untouched — their raw CDN reason is accurate', () => {
    const failure = { family: 'Roboto', weight: 400, reason: 'Google Fonts CSS fetch failed: 500' };
    const { failures } = annotateUncuratedResolution(
      { binaries: [], failures: [failure] },
      new Set<string>(),
    );
    expect(failures).toEqual([failure]);
  });

  it('leaves generic-family rejections untouched via the structured code', () => {
    const failure = {
      family: 'sans-serif',
      weight: 400,
      reason: "'sans-serif' is a CSS generic family and cannot be fetched from Google Fonts",
      code: 'generic-family' as const,
    };
    const { failures } = annotateUncuratedResolution(
      { binaries: [], failures: [failure] },
      new Set(['sans-serif']),
    );
    expect(failures).toEqual([failure]);
  });

  it('emits one notice per family even with multiple loaded weights', () => {
    const { notices } = annotateUncuratedResolution(
      { binaries: [binary('Gravitas One', 400), binary('Gravitas One', 700)], failures: [] },
      new Set(['Gravitas One']),
    );
    expect(notices).toHaveLength(1);
  });
});
