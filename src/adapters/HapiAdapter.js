require("isomorphic-fetch");
const NodeAdapter   = require("./NodeAdapter");

/**
 * Hapi Adapter
 */
class HapiAdapter extends NodeAdapter
{
    /**
     * @param {Object} options 
     * @param {Object} options.request required
     * @param {Object} options.response responseToolkit
     * @param {Object} options.storage optional
     */
    constructor(options)    
    {
        super(options);
    }

    /**
     * Given the current environment, this method must redirect to the given
     * path
     * @param {String} location The path to redirect to
     * @returns {void}
     */
    redirect(location)
    {
        return this.options.responseToolkit.redirect(location);
    }

    /**
     * This is the static entry point and MUST be provided
     * @param {Object} options 
     */
    static smart(options)
    {
        return new HapiAdapter(options).getSmartApi();
    }
}

module.exports = HapiAdapter;
