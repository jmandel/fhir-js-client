var btoa = require('btoa');
var Adapter = require('./adapter');

module.exports = FhirClient;

function ClientPrototype(){};
var clientUtils = require('./utils');
Object.keys(clientUtils).forEach(function(k){
  ClientPrototype.prototype[k] = clientUtils[k];
});

function FhirClient(p) {
  // p.serviceUrl
  // p.auth {
    //    type: 'none' | 'basic' | 'bearer'
    //    basic --> username, password
    //    bearer --> token
    // }

    var client = new ClientPrototype();
    var fhir = Adapter.get().fhirjs;

    var server = client.server = {
      serviceUrl: p.serviceUrl,
      auth: p.auth
    }
    
    var auth = {};
    
    if (server.auth.type === 'basic') {
        auth = {
            user: server.auth.username,
            pass: server.auth.password
        };
    } else if (server.auth.type === 'bearer') {
        auth = {
            bearer: server.auth.token
        };
    }
    
    client.api = fhir({
        baseUrl: server.serviceUrl,
        auth: auth
    });
    
    if (p.patientId) {
        client.patient = {};
        client.patient.id = p.patientId;
        client.patient.api = fhir({
            baseUrl: server.serviceUrl,
            auth: auth,
            patient: p.patientId
        });
        client.patient.read = function(){
            return client.get({resource: 'Patient'});
        };
    }
    
    var fhirAPI = (client.patient)?client.patient.api:client.api;

    client.userId = p.userId;

    server.auth = server.auth ||  {
      type: 'none'
    };

    if (!client.server.serviceUrl || !client.server.serviceUrl.match(/https?:\/\/.+[^\/]$/)) {
      throw "Must supply a `server` propery whose `serviceUrl` begins with http(s) " + 
        "and does NOT include a trailing slash. E.g. `https://fhir.aws.af.cm/fhir`";
    }
    
    client.authenticated = function(p) {
      if (server.auth.type === 'none') {
        return p;
      }

      var h;
      if (server.auth.type === 'basic') {
        h = "Basic " + btoa(server.auth.username + ":" + server.auth.password);
      } else if (server.auth.type === 'bearer') {
        h = "Bearer " + server.auth.token;
      }
      if (!p.headers) {p.headers = {};}
      p.headers['Authorization'] = h
      //p.beforeSend = function (xhr) { xhr.setRequestHeader ("Authorization", h); }

      return p;
    };

    client.get = function(p) {
        var ret = Adapter.get().defer();
        var params = {type: p.resource};
        
        if (p.id) {
            params["id"] = p.id;
        }
          
        fhirAPI.read(params)
            .then(function(res){
                ret.resolve(res.data);
            }, function(){
                ret.reject("Could not fetch " + p.resource + " " + p.id);
            });
          
        return ret.promise;
    };
    
    function getNext (bundle, process) {
        var i;
        var d = bundle.data.entry;
        var entries = [];
        for (i = 0; i < d.length; i++) {
            entries.push(d[i].resource);
        }
        process(entries);
        var def = Adapter.get().defer();
        fhirAPI.nextPage({bundle:bundle.data}).then(function (r) {
            $.when(getNext(r, process)).then(function (t) {
                def.resolve();
            });
        }, function(err) {def.resolve()});
        return def.promise;
    }
    
    client.drain = function(searchParams, process, done, fail) {
        var ret = Adapter.get().defer();
        
        fhirAPI.search(searchParams).then(function(data){
            $.when(getNext(data, process)).then(function() {
                done();
            }, function(err) {
                fail(err);
            });
        });
    };
    
    client.fetchAll = function (searchParams){
        var ret = Adapter.get().defer();
        var results = [];
        
        client.drain(
            searchParams,
            function(entries) {
                entries.forEach(function(entry) {
                    results.push(entry);
                });
            },
            function () {
                ret.resolve(results);
            }
        );
          
        return ret.promise;
    };

    client.user = {
      'read': function(){
        var userId = client.userId;
        resource = userId.split("/")[0];
        uid = userId.split("/")[1];
        return client.get({resource: resource, id: uid});
      }
    };

    return client;
}