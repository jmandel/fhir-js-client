const Client     = require("./Client");
const smart      = require("./smart");
const BrowserEnv = require("./BrowserEnvironment");

// this code is only executed in real browsers!
const env = new BrowserEnv();
const FHIR = {
    // $lab:coverage:off$
    client: (...args) => new Client(env, ...args),
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
        ready: (...args) => smart.ready(env, ...args),
        authorize: (...args) => smart.authorize(env, ...args)
        // $lab:coverage:on$
    }
};

module.exports = FHIR;

