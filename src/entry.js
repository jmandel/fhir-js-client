// Browser API
// -----------------------------------------------------------------------------
// FHIR.oauth2.authorize(options)
// FHIR.oauth2.ready()
// FHIR.client()
if (typeof window == "object") {
    const FHIR = require("./entry-browser");
    window.FHIR = FHIR;
    module.exports = FHIR;
}

// Server API
// -----------------------------------------------------------------------------
// FHIR(req, res).authorize(options)
// FHIR(req, res).ready()
// FHIR(req, res).client()
else {
    const FHIR = require("./entry-node");
    module.exports = FHIR;
}


