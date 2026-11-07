
# hexo-search-engine-submit


The plugin [hexo-submit-urls-to-search-engine](https://github.com/cjh0613/hexo-submit-urls-to-search-engine) has been rewritten to replace the deprecated `request` package with `axios`. The `request` package is no longer maintained, and the original author is not actively maintaining this plugin. To ensure compatibility with modern dependencies and to keep the plugin functional, I have updated it by using `axios` as a supported alternative.

I have removed features that the original author did not implement and those with low usage. These features may be added back in the future.

## Usage

Requires Node.js 22 or newer.

See [CHANGELOG.md](CHANGELOG.md) for release notes and upgrade requirements.

```sh
npm install hexo-search-engine-submit
```

### Edit Hexo _config.yml
#### (1) search_engine_submit

 
```yaml
search_engine_submit:
  enable: true  # Enable or disable this plugin.
  file_path: submit_urls.txt    # The address of the text document, the link to be pushed will be saved in this text document.
  google:
    key_file: google.json     # Service account key path, relative to the Hexo site root. Keep this file private.
    count: 10     # Number of urls to submit. Setting it to 0 will skip this search engine.
  bing:
    token: ""     # This can be specified via the environment variable BING_TOKEN.
    count: 10
  baidu:
    token: ""     # This can be specified via the environment variable BAIDU_TOKEN.
    count: 10
```

#### (2) deploy
```yaml
deploy:
- type: search_engine_submit
```

Omit a search engine's section to skip it, or set its `count` to `0`. For configured engines, the submission count uses the engine's `count`, then the `HEXO_SEO_SUBMIT_COUNT` environment variable, then a default of `10`. Counts must be non-negative integers. The generated file contains enough unique URLs for the largest configured count, ordered by the most recent update.

`file_path` defaults to `submit_urls.txt` inside Hexo's public directory. An empty or omitted Google `key_file` defaults to `google.json` in the Hexo site root. Each API request has a 30-second timeout, and a failure in one engine does not stop submission to the others. Bing submissions respect the available daily quota and the API limit of 500 URLs per batch.

Google's [Indexing API](https://developers.google.com/search/apis/indexing-api/v3/using-api) supports pages with `JobPosting` or `BroadcastEvent` embedded in `VideoObject`. For ordinary blog posts, use a sitemap and Google Search Console. Baidu's submission endpoint uses HTTP; its HTTPS endpoint currently fails certificate verification.

## Development

```sh
npm ci
npm test
npm audit --registry=https://registry.npmjs.org
```

Tests mock the search engine APIs and do not submit real URLs or require credentials.
