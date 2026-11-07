const fs = require('fs/promises');

function getSubmitCount(config) {
    const value = config?.count ?? process.env.HEXO_SEO_SUBMIT_COUNT ?? 10;
    const count = Number(value);

    if (!['number', 'string'].includes(typeof value) ||
        String(value).trim() === '' || !Number.isSafeInteger(count) || count < 0) {
        throw new TypeError('Submission count must be a non-negative integer');
    }

    return count;
}

async function readUrls(filePath) {
    const data = await fs.readFile(filePath, 'utf8');
    return [...new Set(data.split(/\r?\n/).map(line => line.trim()).filter(Boolean))];
}

module.exports = {
    getSubmitCount,
    readUrls
};
