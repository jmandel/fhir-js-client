"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
/* eslint-env browser */

/* global fhir */

const BrowserStorage_1 = require("../storage/BrowserStorage");

const BaseAdapter_1 = require("./BaseAdapter");
/**
 * Browser Adapter
 */


class BrowserAdapter extends BaseAdapter_1.default {
  constructor() {
    super(...arguments);
    /**
     * Stores the URL instance associated with this adapter
     */

    this._url = null;
    /**
     * Holds the Storage instance associated with this instance
     */

    this._storage = null;
  }
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
   */


  redirect(to) {
    location.href = to;
  }
  /**
   * Returns a BrowserStorage object which is just a wrapper around
   * sessionStorage
   */


  getStorage() {
    if (!this._storage) {
      this._storage = new BrowserStorage_1.default();
    }

    return this._storage;
  }

  static smart(options) {
    return new BrowserAdapter(options).getSmartApi();
  }

}

exports.default = BrowserAdapter;