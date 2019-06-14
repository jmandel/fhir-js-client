class Storage {
  /**
   * Gets the value at `key`. Returns a promise that will be resolved
   * with that value (or undefined for missing keys).
   * @param {String} key
   * @returns {Promise<any>}
   */
  async get(key) {
    const value = sessionStorage[key];

    if (value) {
      return JSON.parse(value);
    }

    return null;
  }
  /**
   * Sets the `value` on `key` and returns a promise that will be resolved
   * with the value that was set.
   * @param {String} key
   * @param {any} value
   * @returns {Promise<any>}
   */


  async set(key, value) {
    sessionStorage[key] = JSON.stringify(value);
    return value;
  }
  /**
   * Deletes the value at `key`. Returns a promise that will be resolved
   * with true if the key was deleted or with false if it was not (eg. if
   * did not exist).
   * @param {String} key
   * @returns {Promise<Boolean>}
   */


  async unset(key) {
    if (key in sessionStorage) {
      delete sessionStorage[key];
      return true;
    }

    return false;
  }

}

module.exports = Storage;