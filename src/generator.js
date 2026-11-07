const { getSubmitCount } = require('./utils');

module.exports = function (locals) {
    const log = this.log;
    const config = this.config.search_engine_submit;

    const urlsPath = config.file_path || 'submit_urls.txt';
    // log.info("Generating urls ...");

    const count = Math.max(...['google', 'bing', 'baidu'].map(engine =>
        config[engine] ? getSubmitCount(config[engine]) : 0
    ));
    // get last posts
    const urls = [...new Set(locals.posts.toArray()
        .map(function (post) {
            return {
                "date": post.updated || post.date,
                "permalink": post.permalink
            }
        })
        .sort(function (a, b) {
            return b.date - a.date;
        })
        .map(function (post) {
            return post.permalink;
        }).filter(Boolean))].slice(0, count);

    const urlsStr = urls.join('\n');
    log.info(`${urls.length} post URLs found.`);
    log.info("Posts urls generated in " + urlsPath + "\n" + urlsStr);

    return {
        path: urlsPath,
        data: urlsStr
    };
};
