const BrowserEnvironment = require("./BrowserEnvironment");
const { JSDOM }  = require("jsdom");

const dom = new JSDOM("", { url: "http://localhost" });
global.window = dom.window;

class BrowserEnvironmentWithFhirJs extends BrowserEnvironment
{
    get fhir()
    {
        // $lab:coverage:off$
        return require("../../lib/nativeFhir");
        // $lab:coverage:on$
    }
}

module.exports = BrowserEnvironmentWithFhirJs;