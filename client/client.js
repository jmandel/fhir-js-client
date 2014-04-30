var btoa = require('btoa');
var $ = jQuery = require('./jquery');

module.exports = FhirClient;

function Search(p) {

  var search = {};

  search.client = p.client;
  search.spec = p.spec;
  search.count = p.count || 50;

  var nextPageUrl = null;

  function gotFeed(d){
    return function(data, status) {

      nextPageUrl = null; 
      var feed = data.feed || data;

      if(feed.link) {
        var next = feed.link.filter(function(l){
          return l.rel === "next";
        });
        if (next.length === 1) {
          nextPageUrl = next[0].href 
        }
      }

      var results = search.client.indexFeed(data); 
      d.resolve(results, search);
    }
  };

  function failedFeed(d){
    return function(failure){
      d.reject("Search failed.", arguments);
    }
  };

  search.hasNext = function(){
    return nextPageUrl !== null;
  };

  search.next = function() {

    if (nextPageUrl === null) {
      throw "Next page of search not available!";
    }

    var searchParams = {
      type: 'GET',
      url: nextPageUrl,
      dataType: 'json',
      traditional: true
    };

    var ret = new $.Deferred();
    console.log("Nexting", searchParams);
    $.ajax(search.client.authenticated(searchParams))
    .done(gotFeed(ret))
    .fail(failedFeed(ret));

    return ret;
  };

  search.execute = function() {


    var searchParams = {
      type: 'GET',
      url: search.client.urlFor(search.spec),
      data: search.spec.queryParams(),
      dataType: "json",
      traditional: true
    };

    var ret = new $.Deferred();

    $.ajax(search.client.authenticated(searchParams))
    .done(gotFeed(ret))
    .fail(failedFeed(ret));

    return ret;
  };

  return search;
}

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


function hasCode(o, codeMap){
  var codes = Object.keys(codeMap).forEach(function(c){return codeMap[c];});
  return o.name.coding.filter(function(c){
    return codes.indexOf(c.code) !== -1;
  }).length > 0;
};

function ClientPrototype(){};
ClientPrototype.prototype.byCodes = function(observations, property){

  var bank = this.byCode(observations, property);
  function byCodes(){
    var ret = [];
    for (var i=0; i<arguments.length;i++){
      var set = bank[arguments[i]];
      if (set) {[].push.apply(ret, set);}
    }
    return ret;
  }

  return byCodes;
};

ClientPrototype.prototype.byCode = function(observations, property){
  var ret = {};
  if (!Array.isArray(observations)){
    observations = [observations];
  }
  observations.forEach(function(o){
    o[property].coding.forEach(function(coding){
      ret[coding.code] = ret[coding.code] || [];
      ret[coding.code].push(o);
    });
  });
  return ret;
};

function ensureNumerical(pq) {
  if (typeof pq.value !== "number") {
    throw "Found a non-numerical unit: " + pq.value + " " + pq.code;
  }
};
ClientPrototype.prototype.units = {
  cm: function(pq){
    ensureNumerical(pq);
    if(pq.code == "cm") return pq.value;
    if(pq.code == "m") return 100*pq.value;
    if(pq.code == "in") return 2.54*pq.value;
    if(pq.code == "[in_us]") return 2.54*pq.value;
    if(pq.code == "[in_i]") return 2.54*pq.value;
    throw "Unrecognized length unit: " + pq.code
  },
  kg: function(pq){
    ensureNumerical(pq);
    if(pq.code == "kg") return pq.value;
    if(pq.code.match(/lb/)) return pq.value / 2.20462;
    throw "Unrecognized weight unit: " + pq.code
  },
  any: function(pq){
    ensureNumerical(pq);
    return pq.value
  }
};

function FhirClient(p) {
  // p.serviceUrl
  // p.auth {
    //    type: 'none' | 'basic' | 'bearer'
    //    basic --> username, password
    //    bearer --> token
    // }

    var resources = {};
    var client = new ClientPrototype();

    var server = client.server = {
      serviceUrl: p.serviceUrl,
      auth: p.auth
    }

    client.patientId = p.patientId;

    client.resources = {
      get: function(p) {
        var url = absolute(typeof p === 'string' ? p : (p.resource + '/'+p.id), server);
        if (url in resources) {
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
      resources[absolute(id, server)] = r;
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
        if (url in resources) {
          return p.local(url);
        }

        if (!p.remote) {
          throw "Can't look up unfetched resource " + url;
        }

        return p.remote(url);
      }
    };

    client.followSync = handleReference({
      contained: getContained,
      local: getLocal
    });

    client.follow = handleReference({
      contained: followContained,
      local: followLocal,
      remote: followRemote
    });

    function getContained(from, id) {
      var matches = from.contained.filter(function(c){
        return c._id === id; 
      });
      if (matches.length !== 1)  {
        return null;
      }
      return matches[0];
    }

    function getLocal(url) {
      return resources[url];
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

    client.drain =  function(searchSpec, batch, db){
      var d = $.Deferred();
      if (batch === undefined){
        batch = function(vs, db) {
          db.__results = db.__results || [];
          vs.forEach(function(v){
            db.__results.push(v);
          }); 
        }
      }
      db = db || {};
      client.search(searchSpec)
      .done(function drain(vs, cursor){
        batch(vs, db);
        if (cursor.hasNext()){
          cursor.next().done(drain);
        } else {
          d.resolve(db.__results || db);
        } 
      });
      return d.promise();
    };

    var specs = require('./search-specification')({
      "search": client,
      "drain": client
    });

    function withDefaultPatient(searchSpec){
      var propertyName = null;
      ['patient', 'subject'].forEach(function(pname){
        if (typeof searchSpec[pname] === 'function'){
          propertyName = pname;
        }
      });
      if (propertyName !== null && client.patientId !== undefined){
        searchSpec = searchSpec[propertyName](specs.Patient._id(client.patientId));
      }
      if (searchSpec.resourceName === 'Patient'){
        console.log("Confine to", client.patientId);
        searchSpec = searchSpec._id(client.patientId);
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
      console.log("Write functionality not implemented.");
    };

    Object.keys(specs).forEach(function(r){
      client[r] = {
        read: getterFor(specs[r]),
        post: writeTodo,
        put: writeTodo,
        delete: writeTodo,
        drain: function(){
          return client[r].where.drain();
        },
        search: function(){
          return client[r].where.search();
        },
        where: withDefaultPatient(specs[r])
      };
    });

    return client;
}
