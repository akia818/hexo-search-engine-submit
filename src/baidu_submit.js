const axios = require('axios');
const SearchEngineBase = require('./searchengine');

class Baidu extends SearchEngineBase {
    constructor(log, config, urls) {
        super(log, config, urls);
    }

    async submit(host) {
        const submitCount = Math.min(this.count, this.urls.length);
        if (submitCount === 0) {
            this.log.info('Skip Baidu.\n');
            return;
        }

        let { token } = this.config;
        token = token || process.env.BAIDU_TOKEN;

        if (typeof token !== 'string' || token.trim().length === 0) {
            this.log.error('Baidu token is invalid, please set it within the _config.yml or via environment variable BAIDU_TOKEN');
            return;
        }

        if (submitCount > 0) {
            this.log.info("===== Submitting Baidu urls start. =====");

            try {
                const postData = this.urls.slice(0, submitCount).join('\n');
                const resp = await axios.post(
                    'http://data.zz.baidu.com/urls',
                    postData,
                    {
                        params: { site: host, token },
                        timeout: this.timeout,
                        headers: {
                            'Content-Type': 'text/plain'
                        }
                    }
                );
                this.log.info('Baidu submission response: ', resp.data);
            } catch (err) {
                if (err.response) {
                    this.log.error('Baidu submission error: ', err.response.data);
                }
                else {
                    this.log.error('Baidu submission error: ', err.message);
                }
            }
            finally {
                this.log.info("===== Submitting Baidu urls done.  =====\n");
            }
        } else {
            this.log.info("Skip Baidu.\n");
        }
    }
}

module.exports = Baidu;
