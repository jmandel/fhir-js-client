"use strict";

let api;

if (IS_BROWSER) {
  api = require("./browser");
} else {
  api = require("./server");
}

module.exports = api;