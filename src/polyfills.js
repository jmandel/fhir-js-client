// require("../node_modules/core-js/stable/promise");
// require("../node_modules/core-js/stable/object/assign");
// require("../node_modules/core-js/stable/url");
// require("../node_modules/core-js/stable/url-search-params");
// require("../node_modules/core-js/stable/array/find");

// require("regenerator-runtime/runtime");
// require("@babel/polyfill");

if (typeof window.fetch != "function") {
    window.fetch = require("isomorphic-fetch");
}