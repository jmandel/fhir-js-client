/* global fhir */
const EventEmitter = require("events");
import MemoryStorage       from "./MemoryStorage";
import MockLocation        from "./Location";
import { fhirclient }      from "../../src/types";
import { AbortController } from "abortcontroller-polyfill/dist/cjs-ponyfill";


export default class BrowserEnvironment extends EventEmitter implements fhirclient.Adapter
{
    options: any;

    constructor(options = {})
    {
        super();
        this.options = {
            replaceBrowserHistory: true,
            fullSessionStorageSupport: true,
            ...options
        };
        this._location = new MockLocation("http://localhost");
    }

    get fhir()
    {
        return null;
    }

    getUrl()
    {
        return new URL(this._location.href);
    }

    redirect(to: string)
    {
        this._location.href = to;
        this.emit("redirect");
    }

    getStorage()
    {
        if (!this._storage) {
            this._storage = new MemoryStorage();
        }
        return this._storage;
    }

    relative(url: string)
    {
        return new URL(url, this._location.href).href;
    }

    getSmartApi(): any
    {
        return false;
    }

    btoa(str: string): string
    {
        return Buffer.from(str).toString("base64");
    }

    atob(str: string): string
    {
        return Buffer.from(str, "base64").toString("ascii");
    }

    getAbortController()
    {
        return AbortController;
    }
}
