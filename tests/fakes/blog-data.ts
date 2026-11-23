/**
 * A stand-in for website/generated/blog-data.ts, which `npm run build:blog`
 * writes and git doesn't keep. vitest.config.ts resolves the Pages worker's
 * import here only when the generated file is missing (a fresh checkout, a
 * commit tested alone), so the worker's tests run anywhere. Its tests mock
 * the module anyway.
 */
export const latestBlogPost = null;
