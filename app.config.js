// The static config lives in app.json. The web build (scripts/build-web.sh)
// sets WEB_BASE_URL to the path the site is served from, such as /scan on
// GitHub Pages; everything else, the phone app included, uses app.json as is.
module.exports = ({ config }) =>
  process.env.WEB_BASE_URL
    ? { ...config, experiments: { ...config.experiments, baseUrl: process.env.WEB_BASE_URL } }
    : config;
