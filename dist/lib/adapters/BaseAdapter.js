"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});

const smart_1 = require("../smart");

const Client_1 = require("../Client");
/**
 * This is the abstract base class that adapters must inherit. It just a
 * collection of environment-specific methods that subclasses have to implement.
 */


class BaseAdapter {
  /**
   * @param options Environment-specific options
   */
  constructor(options = {}) {
    this.options = Object.assign({
      // Replaces the browser's current URL
      // using window.history.replaceState API or by reloading.
      replaceBrowserHistory: true,
      // When set to true, this variable will fully utilize
      // HTML5 sessionStorage API.
      // This variable can be overridden to false by setting
      // FHIR.oauth2.settings.fullSessionStorageSupport = false.
      // When set to false, the sessionStorage will be keyed
      // by a state variable. This is to allow the embedded IE browser
      // instances instantiated on a single thread to continue to
      // function without having sessionStorage data shared
      // across the embedded IE instances.
      fullSessionStorageSupport: true
    }, options);
  }

  relative(path) {
    return new URL(path, this.getUrl().href).href;
  }
  /**
   * Creates and returns adapter-aware SMART api. Not that while the shape of
   * the returned object is well known, the arguments to this function are not.
   * Those who override this method are free to require any environment-specific
   * arguments. For example in node we will need a request, a response and
   * optionally a storage or storage factory function.
   */


  getSmartApi() {
    return {
      ready: (...args) => smart_1.ready(this, ...args),
      authorize: options => smart_1.authorize(this, options),
      init: (...args) => smart_1.init(this, ...args),
      client: state => new Client_1.default(this, state),
      options: this.options
    };
  }

}

exports.default = BaseAdapter;