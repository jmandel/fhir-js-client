if (process.browser) {
  module.exports = require('jQuery-browser');
} else {
  var jq = require('jquery');
  var window = require('jsdom').jsdom().createWindow();
  module.exports = jq(window);
}
