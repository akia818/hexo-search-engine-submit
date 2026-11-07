const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { test } = require('node:test');
const axios = require('axios');
const { auth, indexing_v3 } = require('googleapis/build/src/apis/indexing');
const deploy = require('../src/deployer');
const { createLog, withFixture } = require('./helpers.cjs');

const host = 'https://example.com';

async function createContext(t, searchConfig, absolutePublicDir = true) {
    const { baseDir, publicDir } = await withFixture(t);
    await fs.writeFile(path.join(publicDir, 'submit_urls.txt'), `${host}/one\n${host}/two\n`);
    return {
        base_dir: baseDir,
        public_dir: absolutePublicDir ? publicDir : undefined,
        config: {
            public_dir: path.relative(baseDir, publicDir),
            url: `${host}/blog`,
            search_engine_submit: searchConfig
        },
        log: createLog()
    };
}

test('deployment resolves the default URL file from Hexo public_dir and submits only configured engines', async t => {
    const context = await createContext(t, { bing: { count: 1, token: 'bing' } });
    t.mock.method(auth, 'JWT', function () { throw new Error('Google must be skipped'); });
    t.mock.method(axios, 'get', async () => ({ data: { d: { DailyQuota: 10 } } }));
    const post = t.mock.method(axios, 'post', async () => ({ data: {} }));
    await deploy.call(context);
    assert.equal(post.mock.callCount(), 1);
    assert.deepEqual(post.mock.calls[0].arguments[1], { siteUrl: host, urlList: [`${host}/one`] });
    assert.equal(context.log.error.mock.callCount(), 0);
});

test('deployment resolves relative public_dir against the site root', async t => {
    const context = await createContext(t, { baidu: { count: 1, token: 'baidu' } }, false);
    const post = t.mock.method(axios, 'post', async () => ({ data: {} }));
    await deploy.call(context);
    assert.equal(post.mock.callCount(), 1);
    assert.equal(context.log.error.mock.callCount(), 0);
});

test('a Google authentication initialization failure does not stop Bing or Baidu', async t => {
    const context = await createContext(t, {
        google: { count: 1 },
        bing: { count: 1, token: 'bing' },
        baidu: { count: 1, token: 'baidu' }
    });
    t.mock.method(auth, 'JWT', function () { throw new Error('Invalid Google credentials'); });
    t.mock.method(axios, 'get', async () => ({ data: { d: { DailyQuota: 10 } } }));
    const post = t.mock.method(axios, 'post', async () => ({ data: {} }));
    await deploy.call(context);
    assert.equal(post.mock.callCount(), 2);
    assert.deepEqual(context.log.error.mock.calls[0].arguments, [
        'Google submission failed:', 'Invalid Google credentials'
    ]);
});

test('Google count zero skips authentication initialization', async t => {
    const context = await createContext(t, { google: { count: 0 } });
    const constructor = t.mock.method(auth, 'JWT', function () { throw new Error('Unexpected authentication'); });
    await deploy.call(context);
    assert.equal(constructor.mock.callCount(), 0);
    assert.equal(context.log.error.mock.callCount(), 0);
});

test('deployment reports missing URL files through the Hexo logger', async t => {
    const context = await createContext(t, { bing: { count: 1 } });
    context.config.search_engine_submit.file_path = 'missing.txt';
    await deploy.call(context);
    assert.equal(context.log.error.mock.callCount(), 1);
    assert.match(context.log.error.mock.calls[0].arguments[1], /ENOENT/);
});

test('an empty URL file stops submission before any API requests', async t => {
    const context = await createContext(t, { bing: { count: 1, token: 'bing' } });
    await fs.writeFile(path.join(context.public_dir, 'submit_urls.txt'), '\n  \r\n');
    const get = t.mock.method(axios, 'get', () => { throw new Error('Unexpected request'); });
    await deploy.call(context);
    assert.equal(get.mock.callCount(), 0);
    assert.equal(context.log.warn.mock.callCount(), 1);
});

test('submission errors in Bing do not prevent Baidu submissions', async t => {
    const context = await createContext(t, {
        bing: { count: 1, token: 'bing' },
        baidu: { count: 1, token: 'baidu' }
    });
    t.mock.method(axios, 'get', async () => ({ data: { d: { DailyQuota: 10 } } }));
    const post = t.mock.method(axios, 'post', async url => {
        if (url.includes('bing.com')) {
            throw new Error('Bing unavailable');
        }
        return { data: {} };
    });
    await deploy.call(context);
    assert.equal(post.mock.callCount(), 2);
    assert.equal(context.log.error.mock.callCount(), 1);
});

test('deployment passes the Hexo site root to Google authentication', async t => {
    const context = await createContext(t, { google: { count: 1, key_file: 'keys/google.json' } });
    await fs.mkdir(path.join(context.base_dir, 'keys'));
    await fs.rename(path.join(context.base_dir, 'google.json'), path.join(context.base_dir, 'keys', 'google.json'));
    const publish = t.mock.method(indexing_v3.Resource$Urlnotifications.prototype, 'publish', async () => ({ data: {} }));
    await deploy.call(context);
    assert.equal(publish.mock.callCount(), 1);
    assert.equal(context.log.error.mock.callCount(), 0);
});
