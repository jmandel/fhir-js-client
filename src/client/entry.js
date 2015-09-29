var client = require('./client');
var oauth2 = require('./bb-client');
var adapter = require('./adapter');

window.FHIR = {
  client: client,
  oauth2: oauth2
};

module.exports = adapter.set;