const client  = require("./client");
const oauth2  = require("./bb-client");
const adapter = require("./adapter");

window.FHIR = {
    client,
    oauth2
};

module.exports = adapter.set;