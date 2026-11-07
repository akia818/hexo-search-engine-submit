const path = require('path');
const util = require('./utils');

async function deploy(args) {
    try {
        // Validate configuration
        if (!this.config.search_engine_submit) {
            this.log.error('search_engine_submit configuration not found');
            return;
        }

        if (!this.config.url) {
            this.log.error('Blog URL configuration not found');
            return;
        }

        // Read URLs from file
        const config_ses = this.config.search_engine_submit;
        const baseDir = this.base_dir || process.cwd();
        const publicDir = this.public_dir || path.resolve(baseDir, this.config.public_dir || 'public');
        const f_path = path.join(publicDir, config_ses.file_path || 'submit_urls.txt');
        const submit_urls = await util.readUrls(f_path);
        
        if (!submit_urls || submit_urls.length === 0) {
            this.log.warn('No URLs found to submit');
            return;
        }
        this.log.info(`Found ${submit_urls.length} URLs to submit`);

        // Load each engine inside its error boundary.
        const engines = {
            Google: './google_submit',
            Bing: './bing_submit',
            Baidu: './baidu_submit'
        };

        // Parse website domain
        const parsedUrl = new URL(this.config.url);
        const host = parsedUrl.origin;

        // Submit URLs to search engines sequentially
        this.log.info('Start submitting URLs to search engines...\n');
        
        for (const [name, modulePath] of Object.entries(engines)) {
            const engineConfig = config_ses[name.toLowerCase()];
            if (!engineConfig) {
                continue;
            }

            try {
                if (util.getSubmitCount(engineConfig) === 0) {
                    this.log.info(`Skip ${name}.\n`);
                    continue;
                }

                const Engine = require(modulePath);
                const engine = new Engine(this.log, engineConfig, submit_urls, baseDir);
                await engine.submit(host);
            } catch (err) {
                this.log.error(`${name} submission failed:`, err.message);
            }
        }

        this.log.info('URL submission completed');
    } catch (err) {
        this.log.error('URL submission failed:', err.message);
    }
}

module.exports = deploy;
