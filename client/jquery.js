var $ = require('jquery');

if (process.browser) {
  module.exports = $;
} else {
  var window = require('jsdom').jsdom().createWindow();
  module.exports = $(window);
}
