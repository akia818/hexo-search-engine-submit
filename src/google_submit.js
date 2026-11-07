const path = require('path');
const fs = require('fs/promises');
const { auth, indexing } = require('googleapis/build/src/apis/indexing');
const SearchEngineBase = require('./searchengine');

class Google extends SearchEngineBase {
    constructor(log, config, urls, baseDir = process.cwd()) {
        super(log, config, urls);

        this.keyFile = path.resolve(baseDir, this.config.key_file || 'google.json');
    }

    async #submitUrlBatch(urls, batchSize = 100) {
        const credentials = JSON.parse(await fs.readFile(this.keyFile, 'utf8'));
        if (!credentials.client_email || !credentials.private_key) {
            throw new TypeError('Google service account key must include client_email and private_key');
        }
        this.auth = new auth.JWT({
            email: credentials.client_email,
            key: credentials.private_key,
            scopes: ['https://www.googleapis.com/auth/indexing'],
            transporterOptions: { timeout: this.timeout }
        });
        const client = indexing({
            auth: this.auth,
            version: 'v3'
        });

        const results = [];
        const errors = [];

        // Process URLs in chunks
        for (let i = 0; i < urls.length; i += batchSize) {
            const chunk = urls.slice(i, i + batchSize);
            const promises = chunk.map(url => 
                client.urlNotifications.publish({
                    requestBody: {
                        url: url,
                        type: 'URL_UPDATED'
                    }
                }, { timeout: this.timeout }).catch(error => {
                    errors.push({ url, error });
                    return null;
                })
            );

            const responses = await Promise.all(promises);
            results.push(...responses.filter(r => r !== null));
            
            // Add a small delay between batches to avoid rate limiting
            if (i + batchSize < urls.length) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        return { results, errors };
    }

    async submit(host) {
        const submitCount = Math.min(this.count, this.urls.length);

        if (submitCount > 0) {
            this.log.info(`===== Submitting ${submitCount} Google urls start. =====`);
            
            const urlsToSubmit = this.urls.slice(0, submitCount);
            this.log.info('Google urls to submit:');
            urlsToSubmit.forEach(url => this.log.info(url));

            const { results, errors } = await this.#submitUrlBatch(urlsToSubmit);
            
            // Log results
            this.log.info(`Successfully submitted ${results.length} URLs`);
            if (errors.length > 0) {
                this.log.error(`Failed to submit ${errors.length} URLs:`);
                errors.forEach(({ url, error }) => {
                    this.log.error(`URL: ${url}, Error: ${error.message}`);
                });
            }

            this.log.info("===== Submitting Google urls done.  =====\n");
        } else {
            this.log.info('Skip Google.\n');
        }
    }
}

module.exports = Google;
