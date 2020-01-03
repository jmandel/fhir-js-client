/* global fhir */
const EventEmitter = require("events");
import MemoryStorage from "./MemoryStorage";
import Location      from "./Location";

export default class BrowserEnvironment extends EventEmitter
{
    constructor(options = {})
    {
        super();
        this.options = {
            replaceBrowserHistory: true,
            fullSessionStorageSupport: true,
            ...options
        };
        this._location = new Location("http://localhost");
    }

    get fhir()
    {
        return null;
    }

    public getUrl()
    {
        return new URL(this._location.href);
    }

    public redirect(to: string)
    {
        this._location.href = to;
        this.emit("redirect");
    }

    public getStorage()
    {
        if (!this._storage) {
            this._storage = new MemoryStorage();
        }
        return this._storage;
    }

    public relative(url: string)
    {
        return new URL(url, this._location.href).href;
    }
}
