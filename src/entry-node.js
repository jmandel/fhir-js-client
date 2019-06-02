const Client     = require("./Client");
const smart      = require("./smart");
const ServerEnv  = require("./ServerEnvironment");



// Server API
// -----------------------------------------------------------------------------
// FHIR(req, res).authorize(options)
// FHIR(req, res).ready()
// FHIR(req, res).client()
const FHIR = (request, response) => {
    const env = new ServerEnv(request, response);
    return {
        ready: (...args) => smart.ready(env, ...args),
        authorize: (...args) => smart.authorize(env, ...args),
        client: (...args) => new Client(env, ...args)
    };
};
module.exports = FHIR;


