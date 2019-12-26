"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Adapter = exports.default = void 0;

var _BrowserStorage = _interopRequireDefault(require("../storage/BrowserStorage"));

var _BaseAdapter = _interopRequireDefault(require("./BaseAdapter"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/* eslint-env browser */

/* global fhir */

/**
 * Browser Adapter
 * @type {fhirclient.Adapter}
 */
class BrowserAdapter extends _BaseAdapter.default {
  /**
   * In browsers we need to be able to (dynamically) check if fhir.js is
   * included in the page. If it is, it should have created a "fhir" variable
   * in the global scope.
   */
  get fhir() {
    // @ts-ignore
    return typeof fhir === "function" ? fhir : null;
  }
  /**
   * Given the current environment, this method must return the current url
   * as URL instance
   * @returns {URL}
   */


  getUrl() {
    if (!this._url) {
      this._url = new URL(location + "");
    }

    return this._url;
  }
  /**
   * Given the current environment, this method must redirect to the given
   * path
   * @param {String} to The path to redirect to
   * @returns {void}
   */


  redirect(to) {
    location.href = to;
  }
  /**
   * Returns a BrowserStorage object which is just a wrapper around
   * sessionStorage
   * @returns {BrowserStorage}
   */


  getStorage() {
    if (!this._storage) {
      this._storage = new _BrowserStorage.default();
    }

    return this._storage;
  }

  static smart(options) {
    return new BrowserAdapter(options).getSmartApi();
  }

}

exports.Adapter = BrowserAdapter;
var _default = BrowserAdapter.smart;
exports.default = _default;