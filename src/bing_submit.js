const axios = require('axios');
const SearchEngineBase = require('./searchengine');

class Bing extends SearchEngineBase {
    constructor(log, config, urls) {
        super(log, config, urls);
    }

    async getQuotaLimit(host, token) {
        try {
            const resp = await axios.get(
                'https://ssl.bing.com/webmaster/api.svc/json/GetUrlSubmissionQuota',
                {
                    params: { siteUrl: host, apikey: token },
                    timeout: this.timeout,
                    headers: {
                        'Content-Type': 'application/json'
                    }
                }
            );
            return resp.data.d.DailyQuota;
        } catch (err) {
            this.log.error('Failed to get Bing quota:', err.message);
            return 0;
        }
    }

    async submit(host) {
        const submitLimit = Math.min(this.count, this.urls.length);
        if (submitLimit === 0) {
            this.log.info('Skip Bing.\n');
            return;
        }

        let { token } = this.config;
        token = token || process.env.BING_TOKEN;

        if (typeof token !== 'string' || token.trim().length === 0) {
            this.log.error('Bing token is invalid, please set it within the _config.yml or via environment variable BING_TOKEN');
            return;
        }

        // Get available quota
        const quota = await this.getQuotaLimit(host, token);
        if (quota <= 0) {
            this.log.info("No available Bing submission quota for today, skipping...\n");
            return;
        }

        const submitCount = Math.min(quota, submitLimit);

        if (submitCount > 0) {
            this.log.info(`===== Submitting ${submitCount} Bing urls in batch. =====`);

            const urlList = this.urls.slice(0, submitCount);
            this.log.info('Bing urls to submit:');
            urlList.forEach(url => this.log.info(url));

            try {
                for (let i = 0; i < urlList.length; i += 500) {
                    const resp = await axios.post(
                        'https://ssl.bing.com/webmaster/api.svc/json/SubmitUrlBatch',
                        {
                            "siteUrl": host,
                            "urlList": urlList.slice(i, i + 500)
                        },
                        {
                            params: { apikey: token },
                            timeout: this.timeout,
                            headers: {
                                'Content-Type': 'application/json'
                            }
                        }
                    );
                    this.log.info('Bing batch submission response: ', resp.data);
                }
            } catch (err) {
                if (err.response) {
                    this.log.error('Bing batch submission error: ', err.response.data);
                }
                else {
                    this.log.error('Bing batch submission error: ', err.message);
                }
            }
            finally {
                this.log.info("===== Submitting Bing urls done.  =====\n");
            }
        } else {
            this.log.info("Skip Bing.\n");
        }
    }
}

module.exports = Bing;
