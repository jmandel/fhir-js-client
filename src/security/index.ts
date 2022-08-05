declare var IS_BROWSER: boolean;

let api: any;

// $lab:coverage:off$
if (typeof IS_BROWSER != "undefined") {
  api = require("./browser")
} else {
  api = require("./server")
}

export = api
// $lab:coverage:on$