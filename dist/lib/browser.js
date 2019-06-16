/* global HAS_FETCH */
// HAS_FETCH is a constant defined in our webpack config. It helps us exclude
// the fetch polyfill from the library build if the targets do not include IE.
// However, when the code is used as module it becomes part of a project, that
// gets built with another build tool and the fetch polyfill might not be excluded!
// @ts-ignore
if (typeof HAS_FETCH == "undefined" || !HAS_FETCH && typeof window.fetch != "function") {
  require("whatwg-fetch");
} // In Browsers we create an adapter, get the SMART api from it and build the
// global FHIR object


const smart = require("./adapters/BrowserAdapter");

const {
  ready,
  authorize,
  init,
  client,
  options
} = smart(); // $lab:coverage:off$

module.exports = {
  client,
  oauth2: {
    settings: options,
    ready,
    authorize,
    init
  }
}; // $lab:coverage:on$