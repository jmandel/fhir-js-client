"use strict";

let api;
/* istanbul ignore next */

if (typeof IS_BROWSER != "undefined") {
  api = require("./browser");
} else {
  api = require("./server");
}

module.exports = api;