const client       = require("./client");
const { BBClient } = require("./bb-client");
const adapter      = require("./adapter");

window.FHIR = {
    client,
    oauth2: BBClient
};

module.exports = adapter.set;