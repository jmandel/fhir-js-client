import ServerStorage from "../storage/ServerStorage";
import BaseAdapter   from "./BaseAdapter";
import { ClientRequest, ServerResponse } from "http";

/**
 * Node Adapter - works with native NodeJS and with Express
 */
class NodeAdapter extends BaseAdapter
{
    /**
     * Holds the Storage instance associated with this instance
     */
    private _storage: fhirclient.Storage | null = null;

    /**
     * Given the current environment, this method must return the current url
     * as URL instance. In Node we might be behind a proxy!
     */
    public getUrl(): URL
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
     * @param location The path to redirect to
     */
    public redirect(location: string): void
    {
        this.options.response.writeHead(302, { location });
        this.options.response.end();
    }

    /**
     * Returns a ServerStorage instance
     * @returns {ServerStorage}
     */
    public getStorage(): fhirclient.Storage
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
     * @param req The http request
     * @param res The http response
     * @param storage Custom storage instance or a storage
     *  factory function
     */
    public static smart(
        req: ClientRequest,
        res: ServerResponse,
        storage: fhirclient.Storage | ((options?: fhirclient.JsonObject) => fhirclient.Storage)
    )
    {
        return new NodeAdapter({
            request: req,
            response: res,
            storage
        }).getSmartApi();
    }
}

export default NodeAdapter.smart;
export { NodeAdapter as Adapter };
