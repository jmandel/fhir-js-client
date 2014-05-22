var FhirClient = require('../client/client');
var SearchSpecification = require('../client/search-specification.js')();
var sinon = require('sinon');
var window = require('jsdom').jsdom().createWindow();
var ns = require('../client/namespace');
var assert = require('assert');

var $ = jQuery = require('../client/jquery');
var search = SearchSpecification;
var Condition = search.Condition,
Patient = search.Patient;


describe('Search Specification', function(){

  var partial = Patient.given('John');

  it('should have one clause for each term', function(){
    partial.__getClauses().should.have.lengthOf(1);
  });

  it('should do camelCase function names and dash-erized wire calls', function(){
  
    var q = search.Observation .relatedTarget(search.Observation._id("123"));
    q.__getClauses()[0].should.eql({
     name: 'related-target:Observation',
     value: '123'
     });

  });


  it('should allow partial searches to be extended', function(){
    var extended = partial.family('Smith');
    extended.__getClauses().should.have.lengthOf(2);
  });

  it('should represent clauses as name:value dictionaries', function(){
    var first = partial.__getClauses()[0];
    first.should.have.properties({
      'name': 'given',
      'value': 'John'
    })
  });

  it('should support FHIR disjunction parameters', function(){
    var first = Patient.givenIn('John', 'Bob', ['Paul', 'Fred']).__getClauses()[0];
    first.should.have.properties({
      'name': 'given',
      'oneOf': ['John', 'Bob', 'Paul', 'Fred']
    })
  });

  it('should support FHIR conjunction parameters', function(){
    var first = Patient.givenAll('John', 'Bob', ['Paul', 'Fred']).__getClauses();
    first.should.eql([{
      'name': 'given',
      'value': 'John'
    },{
      'name': 'given',
      'value': 'Bob'
    },{
      'name': 'given',
      'value': 'Paul'
    },{
      'name': 'given',
      'value': 'Fred'
    }])
  });


  it('should support the :missing modifer universally', function(){
    var q = Patient.familyMissing(true);
    q.__getClauses().should.eql([{
      name: 'family:missing',
      value: true
    }]);
  });

  describe('searching on token params', function(){

    it('should work via exact string', function(){
      var q = Patient.identifier('http://myhospital|123');
        q.__getClauses().should.eql([{
          name: 'identifier',
          value: 'http://myhospital|123'
        }]);
    });

    it('should work via two-argument ns + code', function(){
      var q = Patient.identifier(ns.rxnorm, '123');
      q.__getClauses().should.eql([{
        name: 'identifier',
        value: 'http://rxnav.nlm.nih.gov/REST/rxcui|123'
      }]);
    });

    it('should allow searching with wildcard namespace', function(){
      var q = Patient.identifier(ns.any, '123');
      q.__getClauses().should.eql([{
        name: 'identifier',
        value: '123'
      }]);
    });

    it('should allow searching with null namespace specified', function(){
      var q = Patient.identifier(ns.none, '123');
      q.__getClauses().should.eql([{
        name: 'identifier',
        value: '|123'
      }]);
    });


  });

  describe('Nesting search params', function(){

    it('should produce chained queries', function(){
      var q = Condition.onset('>=2010')
      .subject(
        Patient.given('John').family('Smith')
      );


      var clauses = q.__getClauses();
      clauses.should.eql([{
        'name': 'onset',
        'value': '>=2010'
      },{
        name:'subject:Patient.given',
        value:'John'
      },{
        name:'subject:Patient.family', 
        value:'Smith'
      }]);
    });

    it('should optimize _id references to avoid unnecessary chaining', function(){
      var q = Condition.subject( Patient._id("123") );
      var clauses = q.__getClauses();
      clauses.should.eql([{
        'name': 'subject:Patient',
        'value': '123'
      }]);
    });

    it('should work with "or clauses"', function(){
      var q = Condition.subject( Patient._id("123").nameIn("john", "smith") );
      var clauses = q.__getClauses();
      clauses.should.eql([{
        'name': 'subject:Patient',
        'value': '123'
      },{
        'name': 'subject:Patient.name',
        'oneOf': ["john", "smith"]
      }]);
    });

  });


});


describe('client', function(){
  var sandbox;

  beforeEach(function(){
    sandbox = sinon.sandbox.create();
  });

  afterEach(function(){
    sandbox = sinon.sandbox.restore();
  });


  describe('Initialization', function(){

    it('should require a well-formatted serviceUrl', function(){

      (function(){
        var client = FhirClient({serviceUrl: 'https://myservice.com/fhir'});
      }).should.not.throw;

      (function(){
        var client = FhirClient({});
      }).should.throw;

      (function(){
        var client = FhirClient({serviceUrl: 'myserver.com/badness'});
      }).should.throw;

      (function(){
        var client = FhirClient({serviceUrl: 'https://myservice.com/fhir/'});
      }).should.throw;


    });

  })

  function stubAjax(req, doneArgs, failArgs) {
    sandbox.stub($, 'ajax', function(){
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
  describe('Search Operation', function(){

    var client = FhirClient({serviceUrl: 'http://localhost'});

      it('should issue a search command', function(done){
        stubAjax(function(p){
          p.type.should.equal('GET');
          p.url.should.match(/\/_search$/);
        }, [
          require('./fixtures/patient.search.json'), 200
        ]);

        client.search(Patient._idIn("123", "456")).done(function(results, s){
          results.should.have.lengthOf(2);
          done()
        });

      })
  });

  describe('A client with patient context', function(){

    var client = FhirClient({serviceUrl: 'http://localhost', patientId:'123'});

      it('should have a patient-specific Conditions api object', function(){
        client.context.patient.Condition.should.be.ok;
      });
      it('should not have a patient-specific Practitioner api object', function(){
        assert(undefined === client.context.patient.Practitioner);
      });
      it('should have generic Practitioner api object', function(){
        client.api.Practitioner.should.be.ok;
      });

  });


});

