"use strict";

let api;

if (typeof IS_BROWSER != "undefined") {
  api = require("./browser");
} else {
  api = require("./server");
}

module.exports = api;