// In Browsers we create an adapter, get the SMART api from it and build the
// global FHIR object
if (typeof window == "object") {
    const smart = require("./adapters/BrowserAdapter");
    const { ready, authorize, init, client } = smart();

    // $lab:coverage:off$
    const FHIR = {
        client,
        oauth2: {
            settings: {
                // Replaces the browser's current URL
                // using window.history.replaceState API or by reloading.
                replaceBrowserHistory: true,

                // When set to true, this variable will fully utilize
                // HTML5 sessionStorage API.
                // This variable can be overridden to false by setting
                // FHIR.oauth2.settings.fullSessionStorageSupport = false.
                // When set to false, the sessionStorage will be keyed
                // by a state variable. This is to allow the embedded IE browser
                // instances instantiated on a single thread to continue to
                // function without having sessionStorage data shared
                // across the embedded IE instances.
                fullSessionStorageSupport: true
            },
            ready,
            authorize,
            init
        }
    };
    // $lab:coverage:on$
    window.FHIR = FHIR;
    module.exports = FHIR;
}

// In node we return the node adapter by default, meaning that one could do:
// require("fhirclient").smart({ request, response }).authorize(options)
// Other adapters can be included directly (E.g.: require("fhirclient/src/adapters/hapi"))
else {
    module.exports = require("./adapters/NodeAdapter");
}


