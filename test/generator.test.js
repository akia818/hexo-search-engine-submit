const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { test } = require('node:test');
const generator = require('../src/generator');
const { readUrls } = require('../src/utils');
const { createLog, withFixture, setEnv } = require('./helpers.cjs');

function generate(config, posts) {
    return generator.call({
        config: { search_engine_submit: config },
        log: createLog()
    }, { posts: { toArray: () => posts } });
}

const posts = Array.from({ length: 15 }, (_, i) => ({
    date: i,
    permalink: `https://example.com/post-${i}`
}));

test('omitted engine sections and counts use the default without crashing', t => {
    setEnv(t, 'HEXO_SEO_SUBMIT_COUNT', undefined);
    const result = generate({ bing: {} }, posts);
    assert.equal(result.path, 'submit_urls.txt');
    assert.deepEqual(result.data.split('\n'), posts.slice(5).reverse().map(post => post.permalink));
});

test('generation honors the environment count and per-engine overrides', t => {
    setEnv(t, 'HEXO_SEO_SUBMIT_COUNT', '3');
    const result = generate({
        file_path: 'seo/urls.txt',
        google: { count: 0 },
        bing: {},
        baidu: { count: 5 }
    }, posts);
    assert.equal(result.path, 'seo/urls.txt');
    assert.equal(result.data.split('\n').length, 5);
});

test('zero counts and omitted engines generate an empty file', t => {
    setEnv(t, 'HEXO_SEO_SUBMIT_COUNT', '0');
    assert.equal(generate({ bing: {} }, posts).data, '');
    assert.equal(generate({ google: { count: 0 } }, posts).data, '');
    assert.equal(generate({}, posts).data, '');
});

test('generation prioritizes updates and removes duplicates before applying the limit', () => {
    const result = generate({ google: { count: 2 } }, [
        { date: 1, updated: 10, permalink: 'https://example.com/updated' },
        { date: 2, updated: 9, permalink: 'https://example.com/updated' },
        { date: 8 },
        { date: 3, permalink: 'https://example.com/recent' }
    ]);
    assert.equal(result.data, 'https://example.com/updated\nhttps://example.com/recent');
});

test('invalid counts fail explicitly instead of producing empty or excessive submissions', t => {
    setEnv(t, 'HEXO_SEO_SUBMIT_COUNT', undefined);
    for (const count of [-1, 1.5, 'invalid', '', ' ', Infinity, true, []]) {
        assert.throws(() => generate({ bing: { count } }, posts), /non-negative integer/);
    }
    setEnv(t, 'HEXO_SEO_SUBMIT_COUNT', 'invalid');
    assert.throws(() => generate({ bing: {} }, posts), /non-negative integer/);
    assert.equal(generate({ bing: { count: 1 } }, posts).data.split('\n').length, 1);
});

test('URL files trim CRLF and blank lines and deduplicate URLs', async t => {
    const { publicDir } = await withFixture(t);
    const filePath = path.join(publicDir, 'urls.txt');
    await fs.writeFile(filePath, ' https://example.com/one \r\n\r\nhttps://example.com/two\nhttps://example.com/one\n');
    assert.deepEqual(await readUrls(filePath), ['https://example.com/one', 'https://example.com/two']);
});

test('missing URL files report the original filesystem error', async t => {
    const { publicDir } = await withFixture(t);
    await assert.rejects(readUrls(path.join(publicDir, 'missing.txt')), { code: 'ENOENT' });
});
