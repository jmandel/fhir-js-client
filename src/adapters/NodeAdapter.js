const fetch = require("node-fetch-npm");
Object.assign(global, {
    fetch,
    Headers : fetch.Headers,
    Request : fetch.Request,
    Response: fetch.Response
});
const ServerStorage = require("../storage/ServerStorage");
const BaseAdapter   = require("./BaseAdapter");

/**
 * Node Adapter - works with native NodeJS and with Express
 * @type {fhirclient.Adapter}
 */
class NodeAdapter extends BaseAdapter
{
    /**
     * Given the current environment, this method must return the current url
     * as URL instance. In Node we might be behind a proxy!
     * @returns {URL}
     */
    getUrl()
    {
        const req = this.options.request;

        let host = req.headers.host;
        if (req.headers["x-forwarded-host"]) {
            host = req.headers["x-forwarded-host"];
            if (req.headers["x-forwarded-port"]) {
                host += ":" + req.headers["x-forwarded-port"];
            }
        }

        const protocol = req.headers["x-forwarded-proto"] || req.protocol || "http";
        const orig = /*req.originalUrl || */req.headers["x-original-uri"] || req.url;
        return new URL(orig, protocol + "://" + host);
    }

    /**
     * Given the current environment, this method must redirect to the given
     * path
     * @param {String} location The path to redirect to
     * @returns {void}
     */
    redirect(location)
    {
        this.options.response.writeHead(302, { location });
        this.options.response.end();
    }

    /**
     * Returns a ServerStorage instance
     * @returns {ServerStorage}
     */
    getStorage()
    {
        if (!this._storage) {
            if (this.options.storage) {
                if (typeof this.options.storage == "function") {
                    this._storage = this.options.storage(this.options);
                } else {
                    this._storage = this.options.storage;
                }
            } else {
                this._storage = new ServerStorage(this.options.request);
            }
        }
        return this._storage;
    }

    /**
     * This is the static entry point and MUST be provided
     * @param {Object} req The http request
     * @param {Object} res The http response
     * @param {Object|Function} storage Custom storage instance or a storage
     *  factory function
     */
    static smart(req, res, storage)
    {
        return new NodeAdapter({
            request: req,
            response: res,
            storage
        }).getSmartApi();
    }
}

module.exports = NodeAdapter.smart;
module.exports.Adapter = NodeAdapter;
