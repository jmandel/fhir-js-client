window.FHIR = {
  client: require('./client'),
  query: require('./search-specification.js')(),
  jQuery: require('./jquery'),
  oauth2: require('./bb-client')
};
