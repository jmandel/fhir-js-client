window.FHIR = {
  client: require('./client'),
  query: require('./search-specification.js')(),
  jQuery: require('./jquery')
};

window.BBClient = require('./bb-client');
