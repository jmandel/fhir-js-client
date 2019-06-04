const Client     = require("./Client");
const smart      = require("./smart");
const ServerEnv  = require("./ServerEnvironment");



// Server API
// -----------------------------------------------------------------------------
// FHIR(req, res [, storage]).authorize(options)
// FHIR(req, res [, storage]).ready()
// FHIR(req, res [, storage]).client()
// FHIR(req, res [, storage]).init()
const FHIR = (request, response, storage) => {
    const env = new ServerEnv(request, response, storage);
    return {
        ready    : (...args) => smart.ready(env, ...args),
        authorize: (...args) => smart.authorize(env, ...args),
        client   : (...args) => new Client(env, ...args),
        init     : (...args) => smart.init(env, ...args)
    };
};
module.exports = FHIR;


