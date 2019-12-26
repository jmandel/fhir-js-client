/* eslint-env browser */

// In Browsers we create an adapter, get the SMART api from it and build the
// global FHIR object
import smart from "./adapters/BrowserAdapter";
const { ready, authorize, init, client, options } = smart();

// We have two kinds of browser builds - "pure" for new browsers and "legacy"
// for old ones. In pure builds we assume that the browser supports everything
// we need. In legacy mode, the library also acts as a polyfill. Babel will
// automatically polyfill everything except "fetch", which we have to handle
// manually.
// @ts-ignore
// eslint-disable-next-line no-undef
if (!global.FHIRCLIENT_PURE) {
    const fetch = require("cross-fetch");
    if (!window.fetch) {
        window.fetch    = fetch.default;
        window.Headers  = fetch.Headers;
        window.Request  = fetch.Request;
        window.Response = fetch.Response;
    }
}

// $lab:coverage:off$
export { client };
export const oauth2 = {
    settings: options,
    ready,
    authorize,
    init
};
// $lab:coverage:on$
