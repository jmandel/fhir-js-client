class ServerStorage
{
    /**
     * @param {Object} request The HTTP request that is expected to have a
     * "session" object property.
     */
    constructor(request)
    {
        this.request = request;
    }

    /**
     * Gets the value at `key`. Returns a promise that will be resolved
     * with that value (or undefined for missing keys).
     * @param {String} key
     * @returns {Promise<any>}
     */
    async get(key)
    {
        return this.request.session[key];
    }

    /**
     * Sets the `value` on `key` and returns a promise that will be resolved
     * with the value that was set.
     * @param {String} key
     * @param {any} value
     * @returns {Promise<any>}
     */
    async set(key, value)
    {
        this.request.session[key] = value;
        return value;
    }

    /**
     * Deletes the value at `key`. Returns a promise that will be resolved
     * with true if the key was deleted or with false if it was not (eg. if
     * did not exist).
     * @param {String} key
     * @returns {Promise<Boolean>}
     */
    async unset(key)
    {
        if (this.request.session.hasOwnProperty(key)) {
            delete this.request.session[key];
            return true;
        }
        return false;
    }

}

module.exports = ServerStorage;
