var btoa = require('btoa');
var Search = require('./search');
var $ = jQuery = require('./jquery');

module.exports = FhirClient;

function absolute(id, server) {
  if (id.match(/^http/)) return id;
  if (id.match(/^urn/)) return id;
  return server.serviceUrl + '/' + id;
}

var regexpSpecialChars = /([\[\]\^\$\|\(\)\\\+\*\?\{\}\=\!])/gi;

function relative(id, server) {
  if (!id.match(/^http/)) {
    id = server.serviceUrl + '/' + id
  }
  var quotedBase = ( server.serviceUrl + '/' ).replace(regexpSpecialChars, '\\$1');
  var matcher = new RegExp("^"+quotedBase + "([^/]+)/([^/]+)(?:/_history/(.*))?$");
  var match = id.match(matcher);
  if (match === null) {
    throw "Couldn't determine a relative URI for " + id;
  }

  var params = {
    resource: match[1],
    id: match[2],
    version: match[3]
  };

  return params;
}

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

    var cache = {};
    var client = new ClientPrototype();

    var server = client.server = {
      serviceUrl: p.serviceUrl,
      auth: p.auth
    }

    client.patientId = p.patientId;
    client.practitionerId = p.practitionerId;

    client.cache = {
      get: function(p) {
        var url = absolute(typeof p === 'string' ? p : (p.resource + '/'+p.id), server);
        if (url in cache) {
          return getLocal(url);
        }
        return null;
      }
    };


    server.auth = server.auth ||  {
      type: 'none'
    };

    if (!client.server.serviceUrl || !client.server.serviceUrl.match(/https?:\/\/.+[^\/]$/)) {
      throw "Must supply a `server` propery whose `serviceUrl` begins with http(s) " + 
        "and does NOT include a trailing slash. E.g. `https://fhir.aws.af.cm/fhir`";
    }

    client.indexResource = function(id, r) {
      r.resourceId = relative(id, server);
      var ret = [r];
      cache[absolute(id, server)] = r;
      return ret;
    };

    client.indexFeed = function(atomResult) {
      var ret = [];
      var feed = atomResult.feed || atomResult;
      (feed.entry || []).forEach(function(e){
        var more = client.indexResource(e.id, e.content);
        [].push.apply(ret, more);
      });
      return ret; 
    };

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

    function handleReference(p){
      return function(from, to) {

        // Resolve any of the following:
        // 1. contained resource
        // 2. already-fetched resource
        // 3. not-yet-fetched resource

        if (to.reference === undefined) {
          throw "Can't follow a non-reference: " + to;
        }

        if (to.reference.match(/^#/)) {
          return p.contained(from, to.reference.slice(1));
        } 

        var url = absolute(to.reference, server);
        if (url in cache) {
          return p.local(url);
        }

        if (!p.remote) {
          throw "Can't look up unfetched resource " + url;
        }

        return p.remote(url);
      }
    };

    client.cachedLink = handleReference({
      contained: getContained,
      local: getLocal
    });

    client.followLink = handleReference({
      contained: followContained,
      local: followLocal,
      remote: followRemote
    });

    function getContained(from, id) {
      var matches = from.contained.filter(function(c){
        return c.id === id; 
      });
      if (matches.length !== 1)  {
        return null;
      }
      return matches[0];
    }

    function getLocal(url) {
      return cache[url];
    }

    function followContained(from, id) {
      var ret = new $.Deferred();
      var val = getContained(from, id);
      setTimeout(function(){
        if (val === null) {
          return ret.reject("No contained resource matches #"+id);
        }
        return ret.resolve(val);
      }, 0);
      return ret;
    };

    function followLocal(url) {
      var ret = new $.Deferred();
      var val = getLocal(url);
      setTimeout(function(){
        if (val === null) {
          return ret.reject("No local resource matches #"+id);
        }
        return ret.resolve(val);
      }, 0);
      return ret;
    };

    function followRemote(url) {
      var getParams = relative(url, server);
      return client.get(getParams);
    };

    client.get = function(p) {
      // p.resource, p.id, ?p.version, p.include

      var ret = new $.Deferred();
      var url = server.serviceUrl + '/' + p.resource + '/' + p.id;

      $.ajax(client.authenticated({
        type: 'GET',
        url: url,
        dataType: 'json'
      }))
      .done(function(data, status){
        var ids = client.indexResource(url, data);
        if (ids.length !== 1) {
          ret.reject("Didn't get exactly one result for " + url);
        }
        ret.resolve(ids[0]);
      })
      .fail(function(){
        ret.reject("Could not fetch " + url, arguments);
      });
      return ret;
    };

    client.urlFor = function(searchSpec){
      return client.server.serviceUrl+searchSpec.queryUrl();
    }

    client.search = function(searchSpec){
      // p.resource, p.count, p.searchTerms
      var s = Search({
        client: client,
        spec: searchSpec
      });

      return s.execute();
    }

    client.drain =  function(searchSpec, batch){
      var d = $.Deferred();

      if (batch === undefined){
        var db = [];
        batch = function(vs) {
          vs.forEach(function(v){
            db.push(v);
          }); 
        }
      }

      db = db || {};
      client.search(searchSpec)
      .done(function drain(vs, cursor){
        batch(vs);
        if (cursor.hasNext()){
          cursor.next().done(drain);
        } else {
          d.resolve();
        } 
      });
      return d.promise();
    };

    var specs = require('./search-specification')({
      "search": client,
      "drain": client
    });

    function patientPropertyName(searchSpec){
      var propertyName = null;
      ['patient', 'subject'].forEach(function(pname){
        if (typeof searchSpec[pname] === 'function'){
          propertyName = pname;
        }
      });
      return propertyName;
    }

    function withDefaultPatient(searchSpec){
      var propertyName = patientPropertyName(searchSpec);
      if (propertyName !== null && client.patientId !== undefined){
        searchSpec = searchSpec[propertyName](specs.Patient._id(client.patientId));
      } else if (searchSpec.resourceName === 'Patient'){
        searchSpec = searchSpec._id(client.patientId);
      } else {
        searchSpec = null;
      }

      return searchSpec;
    }

    function getterFor(r){
      return function(id){

        if (r.resourceName === 'Patient' && id === undefined){
          id = client.patientId
        }

        return client.get({
          resource: r.resourceName,
          id: id
        });
      }
    };

    function writeTodo(){
      throw "Write functionality not implemented.";
    };

    client.context = {};

    client.context.practitioner = {
      'read': function(){
        return client.api.Practitioner.read(client.practitionerId);
      }
    };

    client.context.patient = {
      'read': function(){
        return client.api.Patient.read(client.practitionerId);
      }
    };

    client.api = {};

    // Create SearchSpec-specific handlers
    // as properties on some target object
    // e.g. target.Alert, target.Condition, etc.
    function decorateWithApi(target, tweaks){

      tweaks = tweaks || {filter:function(){return true;}};

      Object.keys(specs).forEach(function(r){

        if (!tweaks.filter(specs[r])){
          return;
        }

        target[r] = {
          read: getterFor(specs[r]),
          post: writeTodo,
          put: writeTodo,
          delete: writeTodo,
          drain: function(){
            return target[r].where.drain();
          },
          search: function(){
            return target[r].where.search();
          },
          where: specs[r]
        };

        if (tweaks.where){
           target[r].where = tweaks.where(target[r].where);
        }

      });
    }

    decorateWithApi(client.api);
    decorateWithApi(client.context.patient, {
      filter: withDefaultPatient,
      where: withDefaultPatient
    });

    return client;
}
