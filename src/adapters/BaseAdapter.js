const smart  = require("../smart");
const Client = require("../Client");

/**
 * This is the abstract base class that adapters must inherit. It just a
 * collection of environment-specific methods that subclasses have to implement.
 */
class BaseAdapter
{
    /**
     * Given the current environment, this method must return the current url
     * as URL instance
     * @returns {URL}
     */
    getUrl() {}

    /**
     * Given the current environment, this method must redirect to the given
     * path
     * @param {String} to The path to redirect to
     * @returns {*}
     */
    redirect(/*to*/) {}

    /**
     * This must return a Storage object
     * @returns {Storage}
     */
    getStorage() {}

    /**
     * Given a relative path, compute and return the full url, assuming that it
     * is relative to the current location
     * @param {String} path The path to convert to absolute
     * @returns {String}
     */
    relative(path)
    {
        return new URL(path, this.getUrl().href).href;
    }

    /**
     * Creates and returns adapter-aware SMART api. Not that while the shape of
     * the returned object is well known, the arguments to this function are not.
     * Those who override this method are free to require any environment-specific
     * arguments. For example in node we will need a request, a response and
     * optionally a storage or storage factory function.
     */
    getSmartApi()
    {
        return {
            ready    : (...args) => smart.ready(this, ...args),
            authorize: (...args) => smart.authorize(this, ...args),
            init     : (...args) => smart.init(this, ...args),
            client   : (...args) => new Client(this, ...args),
        };
    }
}

module.exports = BaseAdapter;
