const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { generateKeyPairSync } = require('node:crypto');
const path = require('node:path');
const { test } = require('node:test');
const axios = require('axios');
const { indexing_v3, auth } = require('googleapis/build/src/apis/indexing');
const Google = require('../src/google_submit');
const Bing = require('../src/bing_submit');
const Baidu = require('../src/baidu_submit');
const { createLog, withFixture, setEnv } = require('./helpers.cjs');

const host = 'https://example.com';
const urls = ['https://example.com/one', 'https://example.com/two', 'https://example.com/three'];
const notifications = indexing_v3.Resource$Urlnotifications.prototype;

function blockRequests(t) {
    const fail = () => { throw new Error('Unexpected network request'); };
    return {
        get: t.mock.method(axios, 'get', fail),
        post: t.mock.method(axios, 'post', fail),
        publish: t.mock.method(notifications, 'publish', fail)
    };
}

test('count zero skips every API including Bing quota lookup', async t => {
    const requests = blockRequests(t);
    for (const Engine of [Google, Bing, Baidu]) {
        await new Engine(createLog(), { count: 0, token: 'token' }, urls).submit(host);
    }
    for (const request of Object.values(requests)) {
        assert.equal(request.mock.callCount(), 0);
    }
});

test('empty URL lists skip every API', async t => {
    const requests = blockRequests(t);
    for (const Engine of [Google, Bing, Baidu]) {
        await new Engine(createLog(), { count: 10, token: 'token' }, []).submit(host);
    }
    for (const request of Object.values(requests)) {
        assert.equal(request.mock.callCount(), 0);
    }
});

test('missing, blank and non-string tokens never send requests', async t => {
    setEnv(t, 'BING_TOKEN', undefined);
    setEnv(t, 'BAIDU_TOKEN', undefined);
    const requests = blockRequests(t);
    for (const Engine of [Bing, Baidu]) {
        for (const token of [undefined, '', ' ', 123]) {
            const log = createLog();
            await new Engine(log, { count: 1, token }, urls).submit(host);
            assert.equal(log.error.mock.callCount(), 1);
        }
    }
    assert.equal(requests.get.mock.callCount(), 0);
    assert.equal(requests.post.mock.callCount(), 0);
});

test('Bing obeys quota and sends encoded params separately from the request body', async t => {
    const token = 'key&=with+characters';
    const get = t.mock.method(axios, 'get', async () => ({ data: { d: { DailyQuota: 2 } } }));
    const post = t.mock.method(axios, 'post', async () => ({ data: { d: null } }));
    await new Bing(createLog(), { token, count: 3 }, urls).submit(host);
    const [quotaUrl, quotaOptions] = get.mock.calls[0].arguments;
    assert.equal(quotaUrl, 'https://ssl.bing.com/webmaster/api.svc/json/GetUrlSubmissionQuota');
    assert.deepEqual(quotaOptions.params, { siteUrl: host, apikey: token });
    assert.equal(quotaOptions.timeout, 30000);
    const [submitUrl, body, options] = post.mock.calls[0].arguments;
    assert.equal(submitUrl, 'https://ssl.bing.com/webmaster/api.svc/json/SubmitUrlBatch');
    assert.deepEqual(body, { siteUrl: host, urlList: urls.slice(0, 2) });
    assert.deepEqual(options.params, { apikey: token });
    assert.equal(options.timeout, 30000);
    assert.match(axios.getUri({ url: submitUrl, params: options.params }), /key%26%3Dwith%2Bcharacters/);
});

test('Bing quota errors skip submission and do not expose the request config', async t => {
    const log = createLog();
    const failure = Object.assign(new Error('Request timed out'), { config: { params: { apikey: 'secret' } } });
    t.mock.method(axios, 'get', async () => { throw failure; });
    const post = t.mock.method(axios, 'post', () => { throw new Error('Unexpected submission'); });
    await new Bing(log, { token: 'secret', count: 1 }, urls).submit(host);
    assert.equal(post.mock.callCount(), 0);
    assert.deepEqual(log.error.mock.calls[0].arguments, ['Failed to get Bing quota:', 'Request timed out']);
});

test('Bing splits large submissions into batches of at most 500 URLs', async t => {
    const manyUrls = Array.from({ length: 1002 }, (_, i) => `${host}/post-${i}`);
    t.mock.method(axios, 'get', async () => ({ data: { d: { DailyQuota: 1001 } } }));
    const post = t.mock.method(axios, 'post', async () => ({ data: {} }));
    await new Bing(createLog(), { token: 'bing', count: 1002 }, manyUrls).submit(host);
    const batches = post.mock.calls.map(call => call.arguments[1].urlList);
    assert.deepEqual(batches.map(batch => batch.length), [500, 500, 1]);
    assert.deepEqual(batches.flat(), manyUrls.slice(0, 1001));
});

test('Bing stops later batches when a batch fails', async t => {
    const manyUrls = Array.from({ length: 501 }, (_, i) => `${host}/post-${i}`);
    t.mock.method(axios, 'get', async () => ({ data: { d: { DailyQuota: 1000 } } }));
    const post = t.mock.method(axios, 'post', async () => { throw new Error('Batch failed'); });
    const log = createLog();
    await new Bing(log, { token: 'bing', count: 501 }, manyUrls).submit(host);
    assert.equal(post.mock.callCount(), 1);
    assert.equal(log.error.mock.callCount(), 1);
});

test('Bing uses the token and count environment fallbacks', async t => {
    setEnv(t, 'BING_TOKEN', 'env-bing');
    setEnv(t, 'HEXO_SEO_SUBMIT_COUNT', '1');
    t.mock.method(axios, 'get', async () => ({ data: { d: { DailyQuota: 10 } } }));
    const post = t.mock.method(axios, 'post', async () => ({ data: {} }));
    await new Bing(createLog(), {}, urls).submit(host);
    assert.deepEqual(post.mock.calls[0].arguments[1].urlList, urls.slice(0, 1));
    assert.equal(post.mock.calls[0].arguments[2].params.apikey, 'env-bing');
});

test('Baidu limits its text body and uses environment credentials and request timeout', async t => {
    setEnv(t, 'BAIDU_TOKEN', 'env&baidu');
    setEnv(t, 'HEXO_SEO_SUBMIT_COUNT', '2');
    const post = t.mock.method(axios, 'post', async () => ({ data: { success: 2 } }));
    await new Baidu(createLog(), {}, urls).submit(host);
    const [url, body, options] = post.mock.calls[0].arguments;
    assert.equal(url, 'http://data.zz.baidu.com/urls');
    assert.equal(body, urls.slice(0, 2).join('\n'));
    assert.deepEqual(options.params, { site: host, token: 'env&baidu' });
    assert.equal(options.timeout, 30000);
    assert.equal(options.headers['Content-Type'], 'text/plain');
});

test('Google resolves empty and relative key paths against the Hexo root', () => {
    const baseDir = path.resolve('hexo-site');
    const defaultEngine = new Google(createLog(), { key_file: '', count: 1 }, urls, baseDir);
    assert.equal(defaultEngine.keyFile, path.join(baseDir, 'google.json'));
    const relativeEngine = new Google(createLog(), { key_file: 'keys/service.json', count: 1 }, urls, baseDir);
    assert.equal(relativeEngine.keyFile, path.join(baseDir, 'keys', 'service.json'));
});

test('Google continues after an individual URL fails and reports success and failure counts', async t => {
    const { baseDir } = await withFixture(t);
    const log = createLog();
    const publish = t.mock.method(notifications, 'publish', async ({ requestBody }) => {
        if (requestBody.url === urls[1]) {
            throw new Error('quota exceeded');
        }
        return { data: {} };
    });
    await new Google(log, { count: 3 }, urls, baseDir).submit(host);
    assert.equal(publish.mock.callCount(), 3);
    assert.deepEqual(publish.mock.calls[0].arguments, [
        { requestBody: { url: urls[0], type: 'URL_UPDATED' } },
        { timeout: 30000 }
    ]);
    assert.ok(log.info.mock.calls.some(call => call.arguments[0] === 'Successfully submitted 2 URLs'));
    assert.ok(log.error.mock.calls.some(call => call.arguments[0].includes('quota exceeded')));
});

test('Google processes more than 100 URLs in bounded batches', async t => {
    const { baseDir } = await withFixture(t);
    const manyUrls = Array.from({ length: 101 }, (_, i) => `${host}/post-${i}`);
    let active = 0;
    let maximumActive = 0;
    const publish = t.mock.method(notifications, 'publish', async () => {
        active++;
        maximumActive = Math.max(maximumActive, active);
        await Promise.resolve();
        active--;
        return { data: {} };
    });
    await new Google(createLog(), { count: 101 }, manyUrls, baseDir).submit(host);
    assert.equal(publish.mock.callCount(), 101);
    assert.equal(maximumActive, 100);
});

test('Google reports missing credential fields before attempting an API request', async t => {
    const { baseDir } = await withFixture(t);
    await fs.writeFile(path.join(baseDir, 'google.json'), '{}');
    const publish = t.mock.method(notifications, 'publish', () => { throw new Error('Unexpected request'); });
    await assert.rejects(new Google(createLog(), { count: 1 }, urls, baseDir).submit(host), /client_email and private_key/);
    assert.equal(publish.mock.callCount(), 0);
});

test('the upgraded Google SDK authenticates a service account and constructs the indexing request', async t => {
    const { baseDir } = await withFixture(t);
    const { privateKey } = generateKeyPairSync('rsa', {
        modulusLength: 2048,
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
        publicKeyEncoding: { type: 'spki', format: 'pem' }
    });
    await fs.writeFile(path.join(baseDir, 'google.json'), JSON.stringify({
        client_email: 'test@example.iam.gserviceaccount.com',
        private_key: privateKey
    }));
    const requests = [];
    t.mock.method(auth.JWT.prototype, 'request', async function (options) {
        this.transporter.request = async tokenOptions => {
            const payload = JSON.parse(Buffer.from(tokenOptions.data.get('assertion').split('.')[1], 'base64url'));
            assert.equal(payload.iss, 'test@example.iam.gserviceaccount.com');
            assert.equal(payload.scope, 'https://www.googleapis.com/auth/indexing');
            assert.equal(this.transporter.defaults.timeout, 30000);
            return { data: { access_token: 'test-access-token', expires_in: 3600, token_type: 'Bearer' } };
        };
        const headers = await this.getRequestHeaders(options.url);
        assert.equal(headers.get('authorization'), 'Bearer test-access-token');
        requests.push(options);
        return { data: {} };
    });
    const log = createLog();
    await new Google(log, { count: 1 }, urls, baseDir).submit(host);
    assert.deepEqual(log.error.mock.calls.map(call => call.arguments), []);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, 'https://indexing.googleapis.com/v3/urlNotifications:publish');
    assert.equal(requests[0].method, 'POST');
    assert.equal(requests[0].timeout, 30000);
    assert.deepEqual(requests[0].data, { url: urls[0], type: 'URL_UPDATED' });
    assert.equal(log.error.mock.callCount(), 0);
});
