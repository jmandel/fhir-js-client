var btoa = require('btoa');
var jQuery = require('./jquery');
var $ = jQuery;

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
    
    client.fhir = fhir({
        baseUrl: server.serviceUrl,
        auth: auth
    });

    client.patientId = p.patientId;
    client.userId = p.userId;

    server.auth = server.auth ||  {
      type: 'none'
    };

    if (!client.server.serviceUrl || !client.server.serviceUrl.match(/https?:\/\/.+[^\/]$/)) {
      throw "Must supply a `server` propery whose `serviceUrl` begins with http(s) " + 
        "and does NOT include a trailing slash. E.g. `https://fhir.aws.af.cm/fhir`";
    }

    client.get = function(p) {
        var ret = new $.Deferred();
          
        client.fhir.search({type: p.resource, query: {id: {$exact: p.id}}})
            .then(function(data){
                ret.resolve(data);
            }, function(){
                ret.reject("Could not fetch " + p.resource + " " + p.id);
            });
          
        return ret;
    };

    client.context = {};

    client.context.user = {
      'read': function(){
        var userId = client.userId;
        resource = userId.split("/")[0];
        uid = userId.split("/")[1];
        return client.get({resource: resource, id: uid});
      }
    };

    client.context.patient = {
      'read': function(){
          return client.get({resource: 'Patient', id: client.patientId});
      }
    };

    return client;
}