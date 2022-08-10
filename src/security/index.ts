declare var IS_BROWSER: boolean;

let api: any;

/* istanbul ignore next */
if (typeof IS_BROWSER != "undefined") {
  api = require("./browser")
} else {
  api = require("./server")
}

export = api