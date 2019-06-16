const NodeAdapter = require("./NodeAdapter").Adapter;
/**
 * Hapi Adapter
 * @type {fhirclient.Adapter}
 */


class HapiAdapter extends NodeAdapter {
  /**
   * Given the current environment, this method must redirect to the given
   * path
   * @param {String} location The path to redirect to
   * @returns {void}
   */
  redirect(location) {
    return this.options.responseToolkit.redirect(location);
  }
  /**
   * This is the static entry point and MUST be provided
   * @param {Object} request The hapi request
   * @param {Object} h The hapi response toolkit
   * @param {Object|Function} storage Custom storage instance or a storage
   *  factory function
   */


  static smart(request, h, storage) {
    return new HapiAdapter({
      request,
      responseToolkit: h,
      storage
    }).getSmartApi();
  }

}

module.exports = HapiAdapter.smart;
module.exports.Adapter = HapiAdapter;