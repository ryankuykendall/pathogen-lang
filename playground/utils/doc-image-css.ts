// How an image in the docs looks (docs/CLAUDE.md "Images";
// scripts/lib/doc-images.ts makes the <figure>). One string, used by the
// static docs page (scripts/build-docs.ts) and the workspace's docs panel, so
// the two can't drift apart.
//
// A page can show a light and a dark version of an image. Which one shows
// follows the theme through two custom properties from styles/theme.css,
// --doc-image-light and --doc-image-dark. Custom properties cross the docs
// panel's shadow root, which a [data-theme] selector can't.

export const docImageCss = `
  .doc-figure {
    margin: 1rem 0 1.25rem;
  }
  .doc-image {
    display: block;
    /* The border counts inside max-width. The docs panel's shadow root doesn't
       get the page's border-box reset, so without this it's 2px too wide. */
    box-sizing: border-box;
    max-width: 100%;
    height: auto;
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: var(--radius-md, 8px);
  }
  .doc-image-light {
    display: var(--doc-image-light, block);
  }
  .doc-image-dark {
    display: var(--doc-image-dark, none);
  }
  .doc-figure figcaption {
    margin-top: 0.5rem;
    font-size: 0.8125rem;
    line-height: 1.5;
    color: var(--text-secondary, #666);
  }
`;
