# Changelog

## v2.0.0

Released on 2026-11-07.

### Breaking changes

- Node.js 22 or newer is required, up from Node.js 18.
- Omitted search engine sections are skipped. Submission counts must be non-negative integers; invalid values now produce an explicit configuration error.

### Fixes and improvements

- Use consistent submission count defaults when generating and deploying URLs, and remove duplicate URLs before applying the limit.
- Resolve generated URL files and Google service account keys against the Hexo site directories.
- Keep failures in one search engine from stopping the others, and skip all API requests when the count is zero.
- Reject missing or invalid Bing and Baidu tokens, encode API query parameters correctly, and set a 30-second request timeout.
- Split Bing submissions into batches of at most 500 URLs while respecting the available daily quota.
- Use Google JWT authentication and load only the Indexing API module to reduce startup time and memory use.
- Upgrade axios to 1.21.0 and googleapis to 189.0.0, and update the lockfile to resolve known dependency vulnerabilities.
- Add 29 regression tests and GitHub Actions checks on Node.js 22 and 24.

### Upgrading

Upgrade Node.js to version 22 or newer before installing this release:

```sh
npm install hexo-search-engine-submit@2.0.0
```

For each engine you want to use, include its section under `search_engine_submit`. Its count uses the configured `count`, then `HEXO_SEO_SUBMIT_COUNT`, then `10`. Set `count: 0` or omit the engine section to skip it.

Google's Indexing API supports pages with `JobPosting` or `BroadcastEvent` embedded in `VideoObject`. Use a sitemap and Google Search Console for ordinary blog posts.

### Validation

- All 29 tests pass on Node.js 22 and 24.
- Plugin registration, real post models, custom public directories, and offline submission verified with Hexo 8.1.2.
- Clean installation and package contents verified; npm audit reports zero known vulnerabilities.
