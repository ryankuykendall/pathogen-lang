// @vitest-environment jsdom
//
// The preview's iframe (playground/utils/preview-iframe.ts), for the workspace's preview
// and the blog viewer's alike: sandboxed, and on a compositing layer of its own. Without
// the layer, any repaint near the drawing rasterizes it again: 1.9 s at 2x pixels for a
// drawing of a few thousand filtered layers, on every tab switch
// (project-docs/preview-raster-perf/README.md; verify-preview-layer.ts measures it).

import { describe, expect, it } from 'vitest';

import { bootstrapPreviewIframe } from '../playground/utils/preview-iframe.ts';

describe('bootstrapPreviewIframe', () => {
  for (const variant of ['full', 'mini'] as const) {
    it(`gives the ${variant} preview's iframe a sandbox and a compositing layer of its own`, () => {
      const iframe = document.createElement('iframe');
      // Never attached, it never loads: the promise is left to wait.
      bootstrapPreviewIframe(iframe, variant).catch(() => undefined);
      expect([iframe.getAttribute('sandbox'), iframe.style.willChange]).toEqual(['allow-same-origin', 'transform']);
    });
  }
});
