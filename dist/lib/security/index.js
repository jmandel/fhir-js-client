"use strict";

let api; // $lab:coverage:off$

if (typeof IS_BROWSER != "undefined") {
  api = require("./browser");
} else {
  api = require("./server");
}

module.exports = api; // $lab:coverage:on$