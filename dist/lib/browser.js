"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.oauth2 = exports.client = void 0;

var _BrowserAdapter = _interopRequireDefault(require("./adapters/BrowserAdapter"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

// In Browsers we create an adapter, get the SMART api from it and build the
// global FHIR object
const {
  ready,
  authorize,
  init,
  client,
  options
} = (0, _BrowserAdapter.default)(); // $lab:coverage:off$

exports.client = client;
const oauth2 = {
  settings: options,
  ready,
  authorize,
  init
}; // $lab:coverage:on$

exports.oauth2 = oauth2;