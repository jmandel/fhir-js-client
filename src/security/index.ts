declare var IS_BROWSER: boolean;

let api: any;

if (IS_BROWSER) {
  api = require("./browser")
} else {
  api = require("./server")
}

export = api