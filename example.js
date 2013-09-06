var FhirClient = require('./client/client');

var fhir = new FhirClient({
  serviceUrl: 'http://hl7connect.healthintersections.com.au/svc/fhir',
  auth: { type: 'none' }
});

fhir.search({
  resource: 'patient',
  searchTerms: {},
  count: 2
}).done(function(resources, nextPage){

  console.log(JSON.stringify(resources,null,2));
  console.log("Getting more...");

  nextPage().done(function(resources, nextPage){
    console.log("More resources", resources, nextPage);
  });

});
