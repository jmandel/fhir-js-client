/* global fhir */
const Storage  = require("./Storage");
const Location = require("./Location");

class BrowserEnvironment
{
    constructor()
    {
        this._location = new Location("http://localhost");
    }

    get fhir()
    {
        return typeof fhir === "function" ? fhir : null;
    }

    getUrl()
    {
        return new URL(this._location.href);
    }

    redirect(to)
    {
        this._location.href = to;
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
        return new URL(url, this._location.href).href;
    }
}

module.exports = BrowserEnvironment;
