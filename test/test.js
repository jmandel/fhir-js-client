var FhirClient = require('../client/client');
var sinon = require('sinon');
var parse = require('../client/parse');
var $ = require('jquery');

function clean(x){
  return JSON.parse(JSON.stringify(x));
}

describe('parse', function(){

  describe('a patient record', function(){

    var patientFixture = require('./fixtures/patient.json');
    var simplifiedPatientFixture = require('./fixtures/patient.simplified.json');
    var patient = parse(patientFixture);

    it('should produce the expected simplified JSON representation', function(){
      clean(patient).should.eql(simplifiedPatientFixture);
    })

    it('should have a JS Date (not a string) for a birthdate', function(){
      patient.birthDate.should.be.an.instanceof(Date);
    })

  })

  describe('an observation', function(){

    var observationFixture = require('./fixtures/observation.json');
    var simplifiedObservationFixture = require('./fixtures/observation.simplified.json');
    var observation = parse(observationFixture);

    it('should produce the expected simplified JSON representation', function(){
      clean(observation).should.eql(simplifiedObservationFixture);
    })

    it('should have a JS \'Date\' (not a string) for appliesDateTime', function(){
      observation.appliesDateTime.should.be.an.instanceof(Date);
    })

    it('should have a JS \'number\' (not a string) for valueQuantity.value', function(){
      observation.component[0].valueQuantity.value.should.be.a('number');
    })

  })

})

describe('client', function(){

  describe('initialization', function(){

    it('should require a well-formatted serviceUrl', function(){

      (function(){
        var client = FhirClient({});
      }).should.throw;

      (function(){
        var client = FhirClient({serviceUrl: 'myserver.com/badness'});
      }).should.throw;

      (function(){
        var client = FhirClient({serviceUrl: 'https://myservice.com/fhir/'});
      }).should.throw;

      (function(){
        var client = FhirClient({serviceUrl: 'https://myservice.com/fhir'});
      }).should.not.throw;

    });

  })

  function stubAjax(req, doneArgs, failArgs) {
    sinon.stub($, 'ajax', function(){
      req.apply(this, arguments);
      return {
        done: function(cb){
          process.nextTick(function(){
            cb.apply(this, doneArgs);
          }); 
          return this;
        },
        fail: function(cb){
          process.nextTick(function(){
            cb.apply(this, failArgs);
          }); 
          return this;
        }
      };
    });
  }

  describe('search', function(){

    var client = FhirClient({serviceUrl: 'https://myservice.com/fhir'});

      it('should issue a search command', function(done){
        stubAjax(function(p){
          p.type.should.equal('GET');
          p.url.should.match(/search$/);
        }, [
          require('./fixtures/patient.search.json'), 200
        ]);

        client.search({resource: 'patient'}).done(function(results, s){
          results.should.have.lengthOf(2);
          done()
        });

      })
  });

})
