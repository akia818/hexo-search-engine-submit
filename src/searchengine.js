const { getSubmitCount } = require('./utils');

class SearchEngineBase {
    constructor(log, config = {}, urls) {
        this.log = log;         // log module of Hexo
        this.config = config;  // config for this search engine
        this.urls = urls;  // urls will be submitted
        this.count = getSubmitCount(config);
        this.timeout = 30000;
    }

    submit(host) {
        throw new Error('submit not implemented!');
    }
}

module.exports = SearchEngineBase;
