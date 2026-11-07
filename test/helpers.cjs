const fs = require('node:fs/promises');
const path = require('node:path');
const { mock } = require('node:test');

function createLog() {
    return {
        info: mock.fn(),
        warn: mock.fn(),
        error: mock.fn()
    };
}

async function withFixture(t) {
    const fixtureRoot = path.join(__dirname, '..', 'node_modules', '.test-fixtures');
    await fs.mkdir(fixtureRoot, { recursive: true });
    const baseDir = await fs.mkdtemp(path.join(fixtureRoot, 'site-'));
    const publicDir = path.join(baseDir, 'custom-public');
    await fs.mkdir(publicDir);
    await fs.writeFile(path.join(baseDir, 'google.json'), JSON.stringify({
        client_email: 'test@example.iam.gserviceaccount.com',
        private_key: 'test-key'
    }));
    t.after(() => fs.rm(baseDir, { recursive: true, force: true }));
    return { baseDir, publicDir };
}

function setEnv(t, name, value) {
    const previous = process.env[name];
    if (value === undefined) {
        delete process.env[name];
    } else {
        process.env[name] = value;
    }
    t.after(() => {
        if (previous === undefined) {
            delete process.env[name];
        } else {
            process.env[name] = previous;
        }
    });
}

module.exports = { createLog, withFixture, setEnv };
