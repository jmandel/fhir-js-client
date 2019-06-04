/* global fhir */
const Storage = require("./BrowserStorage");

class BrowserEnvironment
{
    get fhir()
    {
        return typeof fhir === "function" ? fhir : null;
    }

    getUrl()
    {
        return new URL(location + "");
    }

    redirect(to)
    {
        location.href = to;
    }

    getStorage()
    {
        if (!this._storage) {
            this._storage = new Storage();
        }
        return this._storage;
    }

    relative(url)
    {
        return new URL(url, location.href).href;
    }
}

module.exports = BrowserEnvironment;
