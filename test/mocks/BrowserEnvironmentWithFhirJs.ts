/* eslint-env browser */
import BrowserEnvironment from "./BrowserEnvironment";
import fetch from "cross-fetch";
import { JSDOM } from "jsdom";

const dom = new JSDOM("", { url: "http://localhost" });
(global as any).window = dom.window;
(global as any).fetch = fetch;

class BrowserEnvironmentWithFhirJs extends BrowserEnvironment
{
    get fhir()
    {
        // $lab:coverage:off$
        return require("../../lib/nativeFhir");
        // $lab:coverage:on$
    }
}

export default BrowserEnvironmentWithFhirJs;
