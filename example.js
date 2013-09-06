var FhirClient = require('./client');

var fhir = new FhirClient({
  serviceUrl: 'http://localhost:8080/fhir-server/fhir',
  auth: {
    type: 'basic',
    username: 'client',
    password: 'secret'
  }
});

  fhir.search({
    resource: 'observation',
    searchTerms: {},
    count: 20
  }).done(function(r,s){
    console.log(JSON.stringify(r,null,2));
    r.forEach(function(report, i){
      report.results.result.slice(0,1).forEach(function(result) {
        console.log("do follow"+ result + "of " + report.results.result.slice(0,1).length, result.reference);
        fhir.follow(report, result)
        .done(function(observation){
          console.log("Got", result.reference, observation.valueQuantity.value, observation.valueQuantity.units);
        })
        .fail(function(){
          console.log("Fail", arguments);
        })
      });
    })
  }).fail(function(){
    console.log("Search failed");
    console.log(arguments);
  });
