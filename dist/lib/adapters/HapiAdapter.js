"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});

const NodeAdapter_1 = require("./NodeAdapter");

class HapiAdapter extends NodeAdapter_1.default {
  /**
   * Given the current environment, this method must redirect to the given
   * path
   * @param location The path to redirect to
   */
  redirect(location) {
    return this.options.responseToolkit.redirect(location);
  }
  /**
   * This is the static entry point and MUST be provided
   * @param request The hapi request
   * @param h The hapi response toolkit
   * @param storage Custom storage instance or a storage factory function
   */


  static smart(request, h, storage) {
    return new HapiAdapter({
      request,
      responseToolkit: h,
      storage
    }).getSmartApi();
  }

}

exports.default = HapiAdapter;