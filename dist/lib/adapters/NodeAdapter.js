"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ServerStorage_1 = require("../storage/ServerStorage");
const BaseAdapter_1 = require("./BaseAdapter");
/**
 * Node Adapter - works with native NodeJS and with Express
 */
class NodeAdapter extends BaseAdapter_1.default {
    constructor() {
        super(...arguments);
        /**
         * Holds the Storage instance associated with this instance
         */
        this._storage = null;
    }
    /**
     * Given the current environment, this method must return the current url
     * as URL instance. In Node we might be behind a proxy!
     */
    getUrl() {
        const req = this.options.request;
        let host = req.headers.host;
        if (req.headers["x-forwarded-host"]) {
            host = req.headers["x-forwarded-host"];
            if (req.headers["x-forwarded-port"]) {
                host += ":" + req.headers["x-forwarded-port"];
            }
        }
        const protocol = req.headers["x-forwarded-proto"] || req.protocol || "http";
        const orig = /*req.originalUrl || */ req.headers["x-original-uri"] || req.url;
        return new URL(orig, protocol + "://" + host);
    }
    /**
     * Given the current environment, this method must redirect to the given
     * path
     * @param location The path to redirect to
     */
    redirect(location) {
        this.options.response.writeHead(302, { location });
        this.options.response.end();
    }
    /**
     * Returns a ServerStorage instance
     * @returns {ServerStorage}
     */
    getStorage() {
        if (!this._storage) {
            if (this.options.storage) {
                if (typeof this.options.storage == "function") {
                    this._storage = this.options.storage(this.options);
                }
                else {
                    this._storage = this.options.storage;
                }
            }
            else {
                this._storage = new ServerStorage_1.default(this.options.request);
            }
        }
        return this._storage;
    }
    /**
     * This is the static entry point and MUST be provided
     * @param req The http request
     * @param res The http response
     * @param storage Custom storage instance or a storage
     *  factory function
     */
    static smart(req, res, storage) {
        return new NodeAdapter({
            request: req,
            response: res,
            storage
        }).getSmartApi();
    }
}
exports.Adapter = NodeAdapter;
exports.default = NodeAdapter.smart;
