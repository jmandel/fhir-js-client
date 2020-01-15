import MockLocation from "./Location";
import { EventEmitter } from "events";

class History
{
    _location: string;

    constructor()
    {
        this._location = "";
    }

    replaceState(a: any, b: any, loc: string)
    {
        this._location = loc;
    }
}

// tslint:disable-next-line:max-classes-per-file
class FakeSessionStorage
{
    private _data: { [key: string]: any };

    constructor()
    {
        this._data = {};
    }

    setItem(key: string, value: any) {
        this._data[key] = value;
        return value;
    }

    getItem(key: string) {
        return Object.prototype.hasOwnProperty.call(this._data, key) ? this._data[key] : null;
    }

    removeItem(key: string) {
        if (key in this._data) {
            delete this._data[key];
            return true;
        }
        return false;
    }
}

// tslint:disable-next-line:max-classes-per-file
export default class Window extends EventEmitter
{
    FHIR: any;
    history: History;
    frames: any;
    parent: any;
    top: any;
    self: any;
    opener: any;
    location: MockLocation;
    name: string;
    features: string;
    sessionStorage: FakeSessionStorage;

    constructor(url = "http://localhost", name = "", features = "")
    {
        super();
        this.name = name;
        this.features = features;
        this.history = new History();
        this.location = new MockLocation(url);
        this.sessionStorage = new FakeSessionStorage();

        this.frames = {};
        this.parent = this;
        this.top = this;
        this.self = this;
        this.opener = null;

        this.FHIR = {
            // client: (...args) => new Client(env, ...args),
            oauth2: {
                settings: {
                    replaceBrowserHistory: true,
                    fullSessionStorageSupport: true
                },
                // ready: (...args) => smart.ready(env, ...args),
                // authorize: (...args) => smart.authorize(env, ...args)
                // $lab:coverage:on$
            }
        };
    }

    atob(str: string) {
        return Buffer.from(str, "base64").toString("ascii");
    }

    addEventListener(event: string, handler: () => any)
    {
        this.on(event, handler);
    }

    postMessage(event: MessageEvent)
    {
        this.emit("message", event);
    }

    open(url: string, name: string, features: string)
    {
        let prevented = false;
        this.emit("beforeOpen", {
            prevent: () => {
                prevented = true;
            }
        });
        if (prevented) {
            return null;
        }
        return new Window(url, name, features);
    }
}
