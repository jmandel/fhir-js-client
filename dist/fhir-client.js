(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
(function (process){
var $ = jQuery = require('./jquery');
var FhirClient = require('./client');
var Guid = require('./guid');

var BBClient = module.exports =  {debug: true}

function urlParam(p, forceArray) {
  if (forceArray === undefined) {
    forceArray = false;
  }

  var query = location.search.substr(1);
  var data = query.split("&");
  var result = [];

  for(var i=0; i<data.length; i++) {
    var item = data[i].split("=");
    if (item[0] === p) {
      result.push(item[1]);
    }
  }

  if (forceArray) {
    return result;
  }
  if (result.length === 0){
    return null;
  }
  return result[0];
}

function completeTokenFlow(hash){
  if (!hash){
    hash = window.location.hash;
  }
  var ret =  $.Deferred();

  process.nextTick(function(){
    var oauthResult = hash.match(/#(.*)/);
    oauthResult = oauthResult ? oauthResult[1] : "";
    oauthResult = oauthResult.split(/&/);
    var authorization = {};
    for (var i = 0; i < oauthResult.length; i++){
      var kv = oauthResult[i].split(/=/);
      if (kv[0].length > 0 && kv[1]) {
        authorization[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1]);
      }
    }
    ret.resolve(authorization);
  });

  return ret.promise();
};

function completeCodeFlow(params){
  if (!params){
    params = {
      code: urlParam('code'),
      state: urlParam('state')
    };
  }
  
  var ret =  $.Deferred();
  var state = JSON.parse(sessionStorage[params.state]);

  if (window.history.replaceState){
    window.history.replaceState({}, "", window.location.toString().replace(window.location.search, ""));
  }

  $.ajax({

    url: state.provider.oauth2.token_uri,
    data: {
      code: params.code,
      grant_type: 'authorization_code',
      redirect_uri: state.client.redirect_uri,
      client_id: state.client.client_id
    },
  }).done(function(authz){
    authz = $.extend(authz, params);
    ret.resolve(authz);
  }).fail(function(){
    console.log("failed to exchange code for access_token", arguments);
    ret.reject();
  });;

  return ret.promise();
};

function readyArgs(){

  var input = null;
  var callback = function(){};
  var errback = function(){};

  if (arguments.length === 0){
    throw "Can't call 'ready' without arguments";
  } else if (arguments.length === 1){
    callback = arguments[0];
  } else if (arguments.length === 2){
    if (typeof arguments[0] === 'function'){
      callback = arguments[0];
      errback = arguments[1];
    } else if (typeof arguments[0] === 'object'){
      input = arguments[0];
      callback = arguments[1];
    } else {
      throw "ready called with invalid arguments";
    }
  } else if (arguments.length === 3){
    input = arguments[0];
    callback = arguments[1];
    errback = arguments[2];
  } else {
    throw "ready called with invalid arguments";
  }

  return {
    input: input,
    callback: callback,
    errback: errback
  };
}


BBClient.ready = function(input, callback, errback){

  var args = readyArgs.apply(this, arguments);

  // decide between token flow (implicit grant) and code flow (authorization code grant)
  var isCode = urlParam('code') || (args.input && args.input.code);

  var accessTokenResolver = null;
  if (isCode) {
    accessTokenResolver = completeCodeFlow(args.input);
  } else if (!isCode) {
    accessTokenResolver = completeTokenFlow(args.input);
  }

  accessTokenResolver.done(function(tokenResponse){

    if (!tokenResponse || !tokenResponse.state) {
      return args.errback("No 'state' parameter found in authorization response.");
    }

    var state = JSON.parse(sessionStorage[tokenResponse.state]);
    if (state.fake_token_response) {
      tokenResponse = state.fake_token_response;
    }

    var fhirClientParams = {
      serviceUrl: state.provider.url,
      patientId: tokenResponse.patient
    };

    if (tokenResponse.access_token !== undefined) {
      fhirClientParams.auth = {
        type: 'bearer',
        token: tokenResponse.access_token
      };
    } else if (!state.fake_token_response){
      return args.errback("Failed to obtain access token.");
    }

    var ret = FhirClient(fhirClientParams);
    ret.state = JSON.parse(JSON.stringify(state));
    ret.tokenResponse = JSON.parse(JSON.stringify(tokenResponse));
    args.callback(ret);

  }).fail(function(){
    args.errback("Failed to obtain access token.");
  });;

}

function providers(fhirServiceUrl, callback, errback){

  // Shim for pre-OAuth2 launch parameters
  if (isBypassOAuth()){
    process.nextTick(function(){
      bypassOAuth(fhirServiceUrl, callback);
    });
    return;
  }


  jQuery.get(
    fhirServiceUrl+"/metadata",
    function(r){
      var res = {
        "name": "SMART on FHIR Testing Server",
        "description": "Dev server for SMART on FHIR",
        "url": fhirServiceUrl,
        "oauth2": {
          "registration_uri": null,
          "authorize_uri": null,
          "token_uri": null
        }
      };

      try {
        jQuery.each(r.rest[0].security.extension, function(responseNum, arg){
          if (arg.url === "http://fhir-registry.smartplatforms.org/Profile/oauth-uris#register") {
            res.oauth2.registration_uri = arg.valueUri;
          } else if (arg.url === "http://fhir-registry.smartplatforms.org/Profile/oauth-uris#authorize") {
            res.oauth2.authorize_uri = arg.valueUri;
          } else if (arg.url === "http://fhir-registry.smartplatforms.org/Profile/oauth-uris#token") {
            res.oauth2.token_uri = arg.valueUri;
          }
        });
      }
      catch (err) {
        return errback && errback(err);
      }

      callback && callback(res);
    },
    "json"
  );
};

var noAuthFhirProvider = function(serviceUrl){
  return {
    "oauth2": null,
    "url": serviceUrl
  }
};

function relative(url){
  return (window.location.protocol + "//" + window.location.host + window.location.pathname).match(/(.*\/)[^\/]*/)[1] + url;
}

function isBypassOAuth(){
  return (urlParam("fhirServiceUrl") && !(urlParam("iss")));
}

function bypassOAuth(fhirServiceUrl, callback){
  callback && callback({
    "oauth2": null,
    "url": fhirServiceUrl || urlParam("fhirServiceUrl")
  });
}

BBClient.authorize = function(params, errback){

 if (!errback){
   errback = function(){
     console.log("Failed to discover authorization URL given", params);
   };
 }

 if (!params.client){
    params = {
      client: params
    };
  }

  if (!params.response_type){
    params.response_type = 'code';
  }

   if (!params.client.redirect_uri){
    params.client.redirect_uri = relative("");
  }

  if (!params.client.redirect_uri.match(/:\/\//)){
    params.client.redirect_uri = relative(params.client.redirect_uri);
  }

  var launch = urlParam("launch");
  if (launch){
    if (!params.client.scope.match(/launch:/)){
      params.client.scope += " launch:"+launch;
    }
  }

  var server = urlParam("iss") || urlParam("fhirServiceUrl");
  if (server){
    if (!params.server){
      params.server = server;
    }
  }

  if (urlParam("patientId")){
    params.fake_token_response = params.fake_token_response || {};
    params.fake_token_response.patient = urlParam("patientId");
  }

  providers(params.server, function(provider){

    params.provider = provider;

    var state = Guid.newGuid();
    var client = params.client;

    if (params.provider.oauth2 == null) {
      sessionStorage[state] = JSON.stringify(params);
      window.location.href = client.redirect_uri + "#state="+state;
      return;
    }

    sessionStorage[state] = JSON.stringify(params);

    console.log("sending client reg", params.client);

    var redirect_to=params.provider.oauth2.authorize_uri + "?" + 
      "client_id="+client.client_id+"&"+
      "response_type="+params.response_type+"&"+
      "scope="+client.scope+"&"+
      "redirect_uri="+client.redirect_uri+"&"+
      "state="+state;

    window.location.href = redirect_to;
  }, errback);
};



}).call(this,require("FWaASH"))
},{"./client":3,"./guid":5,"./jquery":6,"FWaASH":16}],2:[function(require,module,exports){
var c = require('../vendor/conformance.json');
var definitions = {};
var camelCased = function(s){
  return s.replace(/-([a-z])/g, function (g) { return g[1].toUpperCase(); });
};

c.rest[0].resource.forEach(function(r){
  var params = [];
  definitions[r.type] = {
    params: params
  };

  r.searchParam.forEach(function(sp){
    params.push({
      name: camelCased(sp.name),
      wireName: sp.name,
      type: sp.type
    });
  });
});

module.exports = definitions;

},{"../vendor/conformance.json":21}],3:[function(require,module,exports){
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
        return client.api.Patient.read(client.patientId);
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

},{"./jquery":6,"./search":9,"./search-specification":8,"./utils":10,"btoa":19}],4:[function(require,module,exports){
window.FHIR = {
  client: require('./client'),
  query: require('./search-specification.js')(),
  jQuery: require('./jquery'),
  oauth2: require('./bb-client')
};

},{"./bb-client":1,"./client":3,"./jquery":6,"./search-specification.js":8}],5:[function(require,module,exports){
var EMPTY = '00000000-0000-0000-0000-000000000000';

var _padLeft = function (paddingString, width, replacementChar) {
  return paddingString.length >= width ? paddingString : _padLeft(replacementChar + paddingString, width, replacementChar || ' ');
};

var _s4 = function (number) {
  var hexadecimalResult = number.toString(16);
  return _padLeft(hexadecimalResult, 4, '0');
};

var _cryptoGuid = function () {
  var buffer = new window.Uint16Array(8);
  window.crypto.getRandomValues(buffer);
  return [_s4(buffer[0]) + _s4(buffer[1]), _s4(buffer[2]), _s4(buffer[3]), _s4(buffer[4]), _s4(buffer[5]) + _s4(buffer[6]) + _s4(buffer[7])].join('-');
};

var _guid = function () {
  var currentDateMilliseconds = new Date().getTime();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (currentChar) {
    var randomChar = (currentDateMilliseconds + Math.random() * 16) % 16 | 0;
    currentDateMilliseconds = Math.floor(currentDateMilliseconds / 16);
    return (currentChar === 'x' ? randomChar : (randomChar & 0x7 | 0x8)).toString(16);
  });
};

var create = function () {
  var hasCrypto = typeof (window.crypto) != 'undefined',
  hasRandomValues = hasCrypto && typeof (window.crypto.getRandomValues) != 'undefined';
  return (hasCrypto && hasRandomValues) ? _cryptoGuid() : _guid();
};

module.exports =  {
  newGuid: create,
  empty: EMPTY
};

},{}],6:[function(require,module,exports){
(function (process){
var $ = require('jquery');

if (process.browser) {
  module.exports = $;
} else {
  var window = require('jsdom').jsdom().createWindow();
  module.exports = $(window);
}

}).call(this,require("FWaASH"))
},{"FWaASH":16,"jquery":20,"jsdom":11}],7:[function(require,module,exports){
module.exports = {
  any: 'special::any_namsace',
  none: 'special::no_namespace',
  loinc: 'http://loinc.org',
  ucum: 'http://unitsofmeasure.org',
  snomed: 'http://snomed.info/sct',
  rxnorm: 'http://rxnav.nlm.nih.gov/REST/rxcui'
}

},{}],8:[function(require,module,exports){
module.exports = function(mixins) {
  mixins = mixins || {};

  var specs = {};
  var util = require('util');
  var namespace = require('./namespace');
  var definitions = require('./build-definitions');

  function defineSearchParam(resourceSpec, searchParam) {
    Object.keys(searchParam.handlers).forEach(function(handlerName){

      resourceSpec.prototype[handlerName] = function(){

        var clause = searchParam.handlers[handlerName].apply(
          searchParam, arguments
        );
        return this.__addClause(clause);

      }
    });
  }


  function SearchSpecification(clauses){ 

    if (clauses === undefined) {
      clauses = [];
    }

    this.resourceName = this.constructor.resourceName;

    this.__addClause = function(c){
      var newClauses = JSON.parse(JSON.stringify(clauses));
      if (!util.isArray(c)){
        c = [c];
      }

      [].push.apply(newClauses, c);
      return new (this.constructor)(newClauses);
    }

    this.__getClauses = function(){
      return clauses;
    }

    this.__printClauses = function(){
      console.log(clauses);
    }

    this.queryUrl = function(){
      return '/'+this.resourceName+'/_search';
    };

    this.queryParams = function(){
      var clauses = this.__getClauses();
      var params = {};
      clauses.forEach(function(c){
        params[c.name] = params[c.name] || [];
        if (c.oneOf !== undefined) {
          var joined = c.oneOf.join(',');
          params[c.name].push(joined);
        } else {
          params[c.name].push(c.value);
        }
      });
      return params;
    }

  }

  defineSearchParam(SearchSpecification, new ReferenceSearchParam('_id'));
  defineSearchParam(SearchSpecification, new SearchParam('_count', '_count', true));
  defineSearchParam(SearchSpecification, new SearchParam('_sortAsc', '_sort:asc', true));
  defineSearchParam(SearchSpecification, new SearchParam('_sortDesc', '_sort:desc', true));
  defineSearchParam(SearchSpecification, new SearchParam('_include', '_include', true));


  function SearchParam(name, wireName, onlyOneHandler){
    this.name = name;
    this.wireName = wireName || name;
    this.handlers = { };
    var that = this;

    this.handlers[name] = function(value){

      if (util.isArray(value) || arguments.length > 1){
        throw "only expected one argument to " + name;
      }

      return {
        name: this.wireName,
        value: value
      };
    };

    if (onlyOneHandler) {
      return;
    }

    var singleArgHandler = this.handlers[name];

    this.handlers[name+'All'] = function(){
      var values = flatten(arguments);
      return values.map(function(v){
        return {
          name: this.wireName,
          value: v
        }
      }, this);
    };

    this.handlers[name+'In'] = function(){
      var values = flatten(arguments);
      return {
        name: this.wireName,
        oneOf: values
      };
    };

    this.handlers[name+'Missing'] = function(value){
      return {
        name: this.wireName+':missing',
        value: value === 'false' ? false : Boolean(value)
      };
    };

    function flatten(args){
      var values = [];
      Array.prototype.slice.call(args, 0).forEach(function(arg){
        if (!util.isArray(arg)){
          arg = [arg];
        }
        arg.forEach(function(arg){
          values.push(singleArgHandler.call(that, arg).value);
        });
      });
      return values;
    }

  }

  function ReferenceSearchParam(name){
    SearchParam.apply(this, arguments);

    this.handlers[name] = function(subSpec){
      var clauseName = this.wireName + ':' + subSpec.constructor.resourceName;

      if (typeof subSpec === 'string'){
        return {
          name: this.wireName,
          value: subSpec
        };
      }
      var clauses = subSpec.__getClauses();

      var ret = clauses.map(function(clause){

        var oneClause = {
          name: clauseName + '.' + clause.name
        };

        if (clause.value) oneClause.value = clause.value;
        if (clause.oneOf) oneClause.oneOf = clause.oneOf;

        if (clause.name == '_id') {
          oneClause = {
            name: clauseName,
            value: clause.value
          }
        }
        return oneClause
      });

      return ret;
    };

  };

  ReferenceSearchParam.prototype = new SearchParam();
  ReferenceSearchParam.prototype.constructor = ReferenceSearchParam;

  function StringSearchParam(name){
    SearchParam.apply(this, arguments);

    this.handlers[name+'Exact'] = function(value){
      return {
        name: this.wireName+':exact',
        value: value
      };
    };

  };
  StringSearchParam.prototype = new SearchParam();
  StringSearchParam.prototype.constructor = StringSearchParam;

  function TokenSearchParam(name){
    SearchParam.apply(this, arguments);

    this.handlers[name] = function(ns, value){

      var ret = {
        name: this.wireName,
        value: ns + '|'+ value
      }

      if (value === undefined) {
        ret.value = ns;
      }

      if (ns === namespace.any) {
        ret.value = value;
      }

      if (ns === namespace.none) {
        ret.value = '|'+value;
      }

      return ret;

    };

    this.handlers[name+'Text'] = function(value){
      return {
        name: this.wireName,
        value: value
      };
    };



  }
  TokenSearchParam.prototype = new SearchParam();
  TokenSearchParam.prototype.constructor = TokenSearchParam;

  function DateSearchParam(name){
    SearchParam.apply(this, arguments);
  }
  DateSearchParam.prototype = new SearchParam();
  DateSearchParam.prototype.constructor = DateSearchParam;

  function NumberSearchParam(name){
    SearchParam.apply(this, arguments);
  }
  NumberSearchParam();
  NumberSearchParam.prototype.constructor = NumberSearchParam;

  function QuantitySearchParam(name){
    SearchParam.apply(this, arguments);
  }
  QuantitySearchParam.prototype = new SearchParam();
  QuantitySearchParam.prototype.constructor = QuantitySearchParam;

  function  CompositeSearchParam(name){
    SearchParam.apply(this, arguments);
  }
  CompositeSearchParam.prototype = new SearchParam();
  CompositeSearchParam.prototype.constructor = CompositeSearchParam;


  var paramTypes = {
    string: StringSearchParam,
    reference: ReferenceSearchParam,
    token: TokenSearchParam,
    number: NumberSearchParam,
    quantity: QuantitySearchParam,
    date: DateSearchParam,
    composite: CompositeSearchParam
  }

  Object.keys(definitions).forEach(function(tname){
    var params = definitions[tname].params;

    // Create a subclass of 'SearchSpecification'
    // to track search parameters for each resource
    // e.g. Patient knows about given name, family name, etc.
    var resourceSpec = function(){
      SearchSpecification.apply(this, arguments);
    };

    resourceSpec.prototype = new SearchSpecification();
    resourceSpec.prototype.constructor = resourceSpec;
    resourceSpec.resourceName = tname;

    params.forEach(function(p){
      defineSearchParam(resourceSpec, new paramTypes[p.type](p.name, p.wireName));
    });

    specs[tname] = new resourceSpec();

  });


  Object.keys(mixins).forEach(function(m){
    SearchSpecification.prototype[m] = function(){
      var args = Array.prototype.slice.call(arguments, 0);
      args.unshift(this);
      return mixins[m][m].apply(mixins[m], args);
    };
  });


  return specs;

};

},{"./build-definitions":2,"./namespace":7,"util":18}],9:[function(require,module,exports){
module.exports = Search;
var $ = jQuery = require('./jquery');

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


},{"./jquery":6}],10:[function(require,module,exports){
var utils = module.exports =  {};

utils.byCodes = function(observations, property){

  var bank = utils.byCode(observations, property);
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

utils.byCode = function(observations, property){
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

utils.units = {
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



},{}],11:[function(require,module,exports){

},{}],12:[function(require,module,exports){
/*!
 * The buffer module from node.js, for the browser.
 *
 * @author   Feross Aboukhadijeh <feross@feross.org> <http://feross.org>
 * @license  MIT
 */

var base64 = require('base64-js')
var ieee754 = require('ieee754')

exports.Buffer = Buffer
exports.SlowBuffer = Buffer
exports.INSPECT_MAX_BYTES = 50
Buffer.poolSize = 8192

/**
 * If `Buffer._useTypedArrays`:
 *   === true    Use Uint8Array implementation (fastest)
 *   === false   Use Object implementation (compatible down to IE6)
 */
Buffer._useTypedArrays = (function () {
  // Detect if browser supports Typed Arrays. Supported browsers are IE 10+, Firefox 4+,
  // Chrome 7+, Safari 5.1+, Opera 11.6+, iOS 4.2+. If the browser does not support adding
  // properties to `Uint8Array` instances, then that's the same as no `Uint8Array` support
  // because we need to be able to add all the node Buffer API methods. This is an issue
  // in Firefox 4-29. Now fixed: https://bugzilla.mozilla.org/show_bug.cgi?id=695438
  try {
    var buf = new ArrayBuffer(0)
    var arr = new Uint8Array(buf)
    arr.foo = function () { return 42 }
    return 42 === arr.foo() &&
        typeof arr.subarray === 'function' // Chrome 9-10 lack `subarray`
  } catch (e) {
    return false
  }
})()

/**
 * Class: Buffer
 * =============
 *
 * The Buffer constructor returns instances of `Uint8Array` that are augmented
 * with function properties for all the node `Buffer` API functions. We use
 * `Uint8Array` so that square bracket notation works as expected -- it returns
 * a single octet.
 *
 * By augmenting the instances, we can avoid modifying the `Uint8Array`
 * prototype.
 */
function Buffer (subject, encoding, noZero) {
  if (!(this instanceof Buffer))
    return new Buffer(subject, encoding, noZero)

  var type = typeof subject

  // Workaround: node's base64 implementation allows for non-padded strings
  // while base64-js does not.
  if (encoding === 'base64' && type === 'string') {
    subject = stringtrim(subject)
    while (subject.length % 4 !== 0) {
      subject = subject + '='
    }
  }

  // Find the length
  var length
  if (type === 'number')
    length = coerce(subject)
  else if (type === 'string')
    length = Buffer.byteLength(subject, encoding)
  else if (type === 'object')
    length = coerce(subject.length) // assume that object is array-like
  else
    throw new Error('First argument needs to be a number, array or string.')

  var buf
  if (Buffer._useTypedArrays) {
    // Preferred: Return an augmented `Uint8Array` instance for best performance
    buf = Buffer._augment(new Uint8Array(length))
  } else {
    // Fallback: Return THIS instance of Buffer (created by `new`)
    buf = this
    buf.length = length
    buf._isBuffer = true
  }

  var i
  if (Buffer._useTypedArrays && typeof subject.byteLength === 'number') {
    // Speed optimization -- use set if we're copying from a typed array
    buf._set(subject)
  } else if (isArrayish(subject)) {
    // Treat array-ish objects as a byte array
    for (i = 0; i < length; i++) {
      if (Buffer.isBuffer(subject))
        buf[i] = subject.readUInt8(i)
      else
        buf[i] = subject[i]
    }
  } else if (type === 'string') {
    buf.write(subject, 0, encoding)
  } else if (type === 'number' && !Buffer._useTypedArrays && !noZero) {
    for (i = 0; i < length; i++) {
      buf[i] = 0
    }
  }

  return buf
}

// STATIC METHODS
// ==============

Buffer.isEncoding = function (encoding) {
  switch (String(encoding).toLowerCase()) {
    case 'hex':
    case 'utf8':
    case 'utf-8':
    case 'ascii':
    case 'binary':
    case 'base64':
    case 'raw':
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      return true
    default:
      return false
  }
}

Buffer.isBuffer = function (b) {
  return !!(b !== null && b !== undefined && b._isBuffer)
}

Buffer.byteLength = function (str, encoding) {
  var ret
  str = str + ''
  switch (encoding || 'utf8') {
    case 'hex':
      ret = str.length / 2
      break
    case 'utf8':
    case 'utf-8':
      ret = utf8ToBytes(str).length
      break
    case 'ascii':
    case 'binary':
    case 'raw':
      ret = str.length
      break
    case 'base64':
      ret = base64ToBytes(str).length
      break
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      ret = str.length * 2
      break
    default:
      throw new Error('Unknown encoding')
  }
  return ret
}

Buffer.concat = function (list, totalLength) {
  assert(isArray(list), 'Usage: Buffer.concat(list, [totalLength])\n' +
      'list should be an Array.')

  if (list.length === 0) {
    return new Buffer(0)
  } else if (list.length === 1) {
    return list[0]
  }

  var i
  if (typeof totalLength !== 'number') {
    totalLength = 0
    for (i = 0; i < list.length; i++) {
      totalLength += list[i].length
    }
  }

  var buf = new Buffer(totalLength)
  var pos = 0
  for (i = 0; i < list.length; i++) {
    var item = list[i]
    item.copy(buf, pos)
    pos += item.length
  }
  return buf
}

// BUFFER INSTANCE METHODS
// =======================

function _hexWrite (buf, string, offset, length) {
  offset = Number(offset) || 0
  var remaining = buf.length - offset
  if (!length) {
    length = remaining
  } else {
    length = Number(length)
    if (length > remaining) {
      length = remaining
    }
  }

  // must be an even number of digits
  var strLen = string.length
  assert(strLen % 2 === 0, 'Invalid hex string')

  if (length > strLen / 2) {
    length = strLen / 2
  }
  for (var i = 0; i < length; i++) {
    var byte = parseInt(string.substr(i * 2, 2), 16)
    assert(!isNaN(byte), 'Invalid hex string')
    buf[offset + i] = byte
  }
  Buffer._charsWritten = i * 2
  return i
}

function _utf8Write (buf, string, offset, length) {
  var charsWritten = Buffer._charsWritten =
    blitBuffer(utf8ToBytes(string), buf, offset, length)
  return charsWritten
}

function _asciiWrite (buf, string, offset, length) {
  var charsWritten = Buffer._charsWritten =
    blitBuffer(asciiToBytes(string), buf, offset, length)
  return charsWritten
}

function _binaryWrite (buf, string, offset, length) {
  return _asciiWrite(buf, string, offset, length)
}

function _base64Write (buf, string, offset, length) {
  var charsWritten = Buffer._charsWritten =
    blitBuffer(base64ToBytes(string), buf, offset, length)
  return charsWritten
}

function _utf16leWrite (buf, string, offset, length) {
  var charsWritten = Buffer._charsWritten =
    blitBuffer(utf16leToBytes(string), buf, offset, length)
  return charsWritten
}

Buffer.prototype.write = function (string, offset, length, encoding) {
  // Support both (string, offset, length, encoding)
  // and the legacy (string, encoding, offset, length)
  if (isFinite(offset)) {
    if (!isFinite(length)) {
      encoding = length
      length = undefined
    }
  } else {  // legacy
    var swap = encoding
    encoding = offset
    offset = length
    length = swap
  }

  offset = Number(offset) || 0
  var remaining = this.length - offset
  if (!length) {
    length = remaining
  } else {
    length = Number(length)
    if (length > remaining) {
      length = remaining
    }
  }
  encoding = String(encoding || 'utf8').toLowerCase()

  var ret
  switch (encoding) {
    case 'hex':
      ret = _hexWrite(this, string, offset, length)
      break
    case 'utf8':
    case 'utf-8':
      ret = _utf8Write(this, string, offset, length)
      break
    case 'ascii':
      ret = _asciiWrite(this, string, offset, length)
      break
    case 'binary':
      ret = _binaryWrite(this, string, offset, length)
      break
    case 'base64':
      ret = _base64Write(this, string, offset, length)
      break
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      ret = _utf16leWrite(this, string, offset, length)
      break
    default:
      throw new Error('Unknown encoding')
  }
  return ret
}

Buffer.prototype.toString = function (encoding, start, end) {
  var self = this

  encoding = String(encoding || 'utf8').toLowerCase()
  start = Number(start) || 0
  end = (end !== undefined)
    ? Number(end)
    : end = self.length

  // Fastpath empty strings
  if (end === start)
    return ''

  var ret
  switch (encoding) {
    case 'hex':
      ret = _hexSlice(self, start, end)
      break
    case 'utf8':
    case 'utf-8':
      ret = _utf8Slice(self, start, end)
      break
    case 'ascii':
      ret = _asciiSlice(self, start, end)
      break
    case 'binary':
      ret = _binarySlice(self, start, end)
      break
    case 'base64':
      ret = _base64Slice(self, start, end)
      break
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      ret = _utf16leSlice(self, start, end)
      break
    default:
      throw new Error('Unknown encoding')
  }
  return ret
}

Buffer.prototype.toJSON = function () {
  return {
    type: 'Buffer',
    data: Array.prototype.slice.call(this._arr || this, 0)
  }
}

// copy(targetBuffer, targetStart=0, sourceStart=0, sourceEnd=buffer.length)
Buffer.prototype.copy = function (target, target_start, start, end) {
  var source = this

  if (!start) start = 0
  if (!end && end !== 0) end = this.length
  if (!target_start) target_start = 0

  // Copy 0 bytes; we're done
  if (end === start) return
  if (target.length === 0 || source.length === 0) return

  // Fatal error conditions
  assert(end >= start, 'sourceEnd < sourceStart')
  assert(target_start >= 0 && target_start < target.length,
      'targetStart out of bounds')
  assert(start >= 0 && start < source.length, 'sourceStart out of bounds')
  assert(end >= 0 && end <= source.length, 'sourceEnd out of bounds')

  // Are we oob?
  if (end > this.length)
    end = this.length
  if (target.length - target_start < end - start)
    end = target.length - target_start + start

  var len = end - start

  if (len < 100 || !Buffer._useTypedArrays) {
    for (var i = 0; i < len; i++)
      target[i + target_start] = this[i + start]
  } else {
    target._set(this.subarray(start, start + len), target_start)
  }
}

function _base64Slice (buf, start, end) {
  if (start === 0 && end === buf.length) {
    return base64.fromByteArray(buf)
  } else {
    return base64.fromByteArray(buf.slice(start, end))
  }
}

function _utf8Slice (buf, start, end) {
  var res = ''
  var tmp = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++) {
    if (buf[i] <= 0x7F) {
      res += decodeUtf8Char(tmp) + String.fromCharCode(buf[i])
      tmp = ''
    } else {
      tmp += '%' + buf[i].toString(16)
    }
  }

  return res + decodeUtf8Char(tmp)
}

function _asciiSlice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++)
    ret += String.fromCharCode(buf[i])
  return ret
}

function _binarySlice (buf, start, end) {
  return _asciiSlice(buf, start, end)
}

function _hexSlice (buf, start, end) {
  var len = buf.length

  if (!start || start < 0) start = 0
  if (!end || end < 0 || end > len) end = len

  var out = ''
  for (var i = start; i < end; i++) {
    out += toHex(buf[i])
  }
  return out
}

function _utf16leSlice (buf, start, end) {
  var bytes = buf.slice(start, end)
  var res = ''
  for (var i = 0; i < bytes.length; i += 2) {
    res += String.fromCharCode(bytes[i] + bytes[i+1] * 256)
  }
  return res
}

Buffer.prototype.slice = function (start, end) {
  var len = this.length
  start = clamp(start, len, 0)
  end = clamp(end, len, len)

  if (Buffer._useTypedArrays) {
    return Buffer._augment(this.subarray(start, end))
  } else {
    var sliceLen = end - start
    var newBuf = new Buffer(sliceLen, undefined, true)
    for (var i = 0; i < sliceLen; i++) {
      newBuf[i] = this[i + start]
    }
    return newBuf
  }
}

// `get` will be removed in Node 0.13+
Buffer.prototype.get = function (offset) {
  console.log('.get() is deprecated. Access using array indexes instead.')
  return this.readUInt8(offset)
}

// `set` will be removed in Node 0.13+
Buffer.prototype.set = function (v, offset) {
  console.log('.set() is deprecated. Access using array indexes instead.')
  return this.writeUInt8(v, offset)
}

Buffer.prototype.readUInt8 = function (offset, noAssert) {
  if (!noAssert) {
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset < this.length, 'Trying to read beyond buffer length')
  }

  if (offset >= this.length)
    return

  return this[offset]
}

function _readUInt16 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  var val
  if (littleEndian) {
    val = buf[offset]
    if (offset + 1 < len)
      val |= buf[offset + 1] << 8
  } else {
    val = buf[offset] << 8
    if (offset + 1 < len)
      val |= buf[offset + 1]
  }
  return val
}

Buffer.prototype.readUInt16LE = function (offset, noAssert) {
  return _readUInt16(this, offset, true, noAssert)
}

Buffer.prototype.readUInt16BE = function (offset, noAssert) {
  return _readUInt16(this, offset, false, noAssert)
}

function _readUInt32 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  var val
  if (littleEndian) {
    if (offset + 2 < len)
      val = buf[offset + 2] << 16
    if (offset + 1 < len)
      val |= buf[offset + 1] << 8
    val |= buf[offset]
    if (offset + 3 < len)
      val = val + (buf[offset + 3] << 24 >>> 0)
  } else {
    if (offset + 1 < len)
      val = buf[offset + 1] << 16
    if (offset + 2 < len)
      val |= buf[offset + 2] << 8
    if (offset + 3 < len)
      val |= buf[offset + 3]
    val = val + (buf[offset] << 24 >>> 0)
  }
  return val
}

Buffer.prototype.readUInt32LE = function (offset, noAssert) {
  return _readUInt32(this, offset, true, noAssert)
}

Buffer.prototype.readUInt32BE = function (offset, noAssert) {
  return _readUInt32(this, offset, false, noAssert)
}

Buffer.prototype.readInt8 = function (offset, noAssert) {
  if (!noAssert) {
    assert(offset !== undefined && offset !== null,
        'missing offset')
    assert(offset < this.length, 'Trying to read beyond buffer length')
  }

  if (offset >= this.length)
    return

  var neg = this[offset] & 0x80
  if (neg)
    return (0xff - this[offset] + 1) * -1
  else
    return this[offset]
}

function _readInt16 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  var val = _readUInt16(buf, offset, littleEndian, true)
  var neg = val & 0x8000
  if (neg)
    return (0xffff - val + 1) * -1
  else
    return val
}

Buffer.prototype.readInt16LE = function (offset, noAssert) {
  return _readInt16(this, offset, true, noAssert)
}

Buffer.prototype.readInt16BE = function (offset, noAssert) {
  return _readInt16(this, offset, false, noAssert)
}

function _readInt32 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  var val = _readUInt32(buf, offset, littleEndian, true)
  var neg = val & 0x80000000
  if (neg)
    return (0xffffffff - val + 1) * -1
  else
    return val
}

Buffer.prototype.readInt32LE = function (offset, noAssert) {
  return _readInt32(this, offset, true, noAssert)
}

Buffer.prototype.readInt32BE = function (offset, noAssert) {
  return _readInt32(this, offset, false, noAssert)
}

function _readFloat (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset + 3 < buf.length, 'Trying to read beyond buffer length')
  }

  return ieee754.read(buf, offset, littleEndian, 23, 4)
}

Buffer.prototype.readFloatLE = function (offset, noAssert) {
  return _readFloat(this, offset, true, noAssert)
}

Buffer.prototype.readFloatBE = function (offset, noAssert) {
  return _readFloat(this, offset, false, noAssert)
}

function _readDouble (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset + 7 < buf.length, 'Trying to read beyond buffer length')
  }

  return ieee754.read(buf, offset, littleEndian, 52, 8)
}

Buffer.prototype.readDoubleLE = function (offset, noAssert) {
  return _readDouble(this, offset, true, noAssert)
}

Buffer.prototype.readDoubleBE = function (offset, noAssert) {
  return _readDouble(this, offset, false, noAssert)
}

Buffer.prototype.writeUInt8 = function (value, offset, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset < this.length, 'trying to write beyond buffer length')
    verifuint(value, 0xff)
  }

  if (offset >= this.length) return

  this[offset] = value
}

function _writeUInt16 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'trying to write beyond buffer length')
    verifuint(value, 0xffff)
  }

  var len = buf.length
  if (offset >= len)
    return

  for (var i = 0, j = Math.min(len - offset, 2); i < j; i++) {
    buf[offset + i] =
        (value & (0xff << (8 * (littleEndian ? i : 1 - i)))) >>>
            (littleEndian ? i : 1 - i) * 8
  }
}

Buffer.prototype.writeUInt16LE = function (value, offset, noAssert) {
  _writeUInt16(this, value, offset, true, noAssert)
}

Buffer.prototype.writeUInt16BE = function (value, offset, noAssert) {
  _writeUInt16(this, value, offset, false, noAssert)
}

function _writeUInt32 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'trying to write beyond buffer length')
    verifuint(value, 0xffffffff)
  }

  var len = buf.length
  if (offset >= len)
    return

  for (var i = 0, j = Math.min(len - offset, 4); i < j; i++) {
    buf[offset + i] =
        (value >>> (littleEndian ? i : 3 - i) * 8) & 0xff
  }
}

Buffer.prototype.writeUInt32LE = function (value, offset, noAssert) {
  _writeUInt32(this, value, offset, true, noAssert)
}

Buffer.prototype.writeUInt32BE = function (value, offset, noAssert) {
  _writeUInt32(this, value, offset, false, noAssert)
}

Buffer.prototype.writeInt8 = function (value, offset, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset < this.length, 'Trying to write beyond buffer length')
    verifsint(value, 0x7f, -0x80)
  }

  if (offset >= this.length)
    return

  if (value >= 0)
    this.writeUInt8(value, offset, noAssert)
  else
    this.writeUInt8(0xff + value + 1, offset, noAssert)
}

function _writeInt16 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'Trying to write beyond buffer length')
    verifsint(value, 0x7fff, -0x8000)
  }

  var len = buf.length
  if (offset >= len)
    return

  if (value >= 0)
    _writeUInt16(buf, value, offset, littleEndian, noAssert)
  else
    _writeUInt16(buf, 0xffff + value + 1, offset, littleEndian, noAssert)
}

Buffer.prototype.writeInt16LE = function (value, offset, noAssert) {
  _writeInt16(this, value, offset, true, noAssert)
}

Buffer.prototype.writeInt16BE = function (value, offset, noAssert) {
  _writeInt16(this, value, offset, false, noAssert)
}

function _writeInt32 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to write beyond buffer length')
    verifsint(value, 0x7fffffff, -0x80000000)
  }

  var len = buf.length
  if (offset >= len)
    return

  if (value >= 0)
    _writeUInt32(buf, value, offset, littleEndian, noAssert)
  else
    _writeUInt32(buf, 0xffffffff + value + 1, offset, littleEndian, noAssert)
}

Buffer.prototype.writeInt32LE = function (value, offset, noAssert) {
  _writeInt32(this, value, offset, true, noAssert)
}

Buffer.prototype.writeInt32BE = function (value, offset, noAssert) {
  _writeInt32(this, value, offset, false, noAssert)
}

function _writeFloat (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to write beyond buffer length')
    verifIEEE754(value, 3.4028234663852886e+38, -3.4028234663852886e+38)
  }

  var len = buf.length
  if (offset >= len)
    return

  ieee754.write(buf, value, offset, littleEndian, 23, 4)
}

Buffer.prototype.writeFloatLE = function (value, offset, noAssert) {
  _writeFloat(this, value, offset, true, noAssert)
}

Buffer.prototype.writeFloatBE = function (value, offset, noAssert) {
  _writeFloat(this, value, offset, false, noAssert)
}

function _writeDouble (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 7 < buf.length,
        'Trying to write beyond buffer length')
    verifIEEE754(value, 1.7976931348623157E+308, -1.7976931348623157E+308)
  }

  var len = buf.length
  if (offset >= len)
    return

  ieee754.write(buf, value, offset, littleEndian, 52, 8)
}

Buffer.prototype.writeDoubleLE = function (value, offset, noAssert) {
  _writeDouble(this, value, offset, true, noAssert)
}

Buffer.prototype.writeDoubleBE = function (value, offset, noAssert) {
  _writeDouble(this, value, offset, false, noAssert)
}

// fill(value, start=0, end=buffer.length)
Buffer.prototype.fill = function (value, start, end) {
  if (!value) value = 0
  if (!start) start = 0
  if (!end) end = this.length

  if (typeof value === 'string') {
    value = value.charCodeAt(0)
  }

  assert(typeof value === 'number' && !isNaN(value), 'value is not a number')
  assert(end >= start, 'end < start')

  // Fill 0 bytes; we're done
  if (end === start) return
  if (this.length === 0) return

  assert(start >= 0 && start < this.length, 'start out of bounds')
  assert(end >= 0 && end <= this.length, 'end out of bounds')

  for (var i = start; i < end; i++) {
    this[i] = value
  }
}

Buffer.prototype.inspect = function () {
  var out = []
  var len = this.length
  for (var i = 0; i < len; i++) {
    out[i] = toHex(this[i])
    if (i === exports.INSPECT_MAX_BYTES) {
      out[i + 1] = '...'
      break
    }
  }
  return '<Buffer ' + out.join(' ') + '>'
}

/**
 * Creates a new `ArrayBuffer` with the *copied* memory of the buffer instance.
 * Added in Node 0.12. Only available in browsers that support ArrayBuffer.
 */
Buffer.prototype.toArrayBuffer = function () {
  if (typeof Uint8Array !== 'undefined') {
    if (Buffer._useTypedArrays) {
      return (new Buffer(this)).buffer
    } else {
      var buf = new Uint8Array(this.length)
      for (var i = 0, len = buf.length; i < len; i += 1)
        buf[i] = this[i]
      return buf.buffer
    }
  } else {
    throw new Error('Buffer.toArrayBuffer not supported in this browser')
  }
}

// HELPER FUNCTIONS
// ================

function stringtrim (str) {
  if (str.trim) return str.trim()
  return str.replace(/^\s+|\s+$/g, '')
}

var BP = Buffer.prototype

/**
 * Augment a Uint8Array *instance* (not the Uint8Array class!) with Buffer methods
 */
Buffer._augment = function (arr) {
  arr._isBuffer = true

  // save reference to original Uint8Array get/set methods before overwriting
  arr._get = arr.get
  arr._set = arr.set

  // deprecated, will be removed in node 0.13+
  arr.get = BP.get
  arr.set = BP.set

  arr.write = BP.write
  arr.toString = BP.toString
  arr.toLocaleString = BP.toString
  arr.toJSON = BP.toJSON
  arr.copy = BP.copy
  arr.slice = BP.slice
  arr.readUInt8 = BP.readUInt8
  arr.readUInt16LE = BP.readUInt16LE
  arr.readUInt16BE = BP.readUInt16BE
  arr.readUInt32LE = BP.readUInt32LE
  arr.readUInt32BE = BP.readUInt32BE
  arr.readInt8 = BP.readInt8
  arr.readInt16LE = BP.readInt16LE
  arr.readInt16BE = BP.readInt16BE
  arr.readInt32LE = BP.readInt32LE
  arr.readInt32BE = BP.readInt32BE
  arr.readFloatLE = BP.readFloatLE
  arr.readFloatBE = BP.readFloatBE
  arr.readDoubleLE = BP.readDoubleLE
  arr.readDoubleBE = BP.readDoubleBE
  arr.writeUInt8 = BP.writeUInt8
  arr.writeUInt16LE = BP.writeUInt16LE
  arr.writeUInt16BE = BP.writeUInt16BE
  arr.writeUInt32LE = BP.writeUInt32LE
  arr.writeUInt32BE = BP.writeUInt32BE
  arr.writeInt8 = BP.writeInt8
  arr.writeInt16LE = BP.writeInt16LE
  arr.writeInt16BE = BP.writeInt16BE
  arr.writeInt32LE = BP.writeInt32LE
  arr.writeInt32BE = BP.writeInt32BE
  arr.writeFloatLE = BP.writeFloatLE
  arr.writeFloatBE = BP.writeFloatBE
  arr.writeDoubleLE = BP.writeDoubleLE
  arr.writeDoubleBE = BP.writeDoubleBE
  arr.fill = BP.fill
  arr.inspect = BP.inspect
  arr.toArrayBuffer = BP.toArrayBuffer

  return arr
}

// slice(start, end)
function clamp (index, len, defaultValue) {
  if (typeof index !== 'number') return defaultValue
  index = ~~index;  // Coerce to integer.
  if (index >= len) return len
  if (index >= 0) return index
  index += len
  if (index >= 0) return index
  return 0
}

function coerce (length) {
  // Coerce length to a number (possibly NaN), round up
  // in case it's fractional (e.g. 123.456) then do a
  // double negate to coerce a NaN to 0. Easy, right?
  length = ~~Math.ceil(+length)
  return length < 0 ? 0 : length
}

function isArray (subject) {
  return (Array.isArray || function (subject) {
    return Object.prototype.toString.call(subject) === '[object Array]'
  })(subject)
}

function isArrayish (subject) {
  return isArray(subject) || Buffer.isBuffer(subject) ||
      subject && typeof subject === 'object' &&
      typeof subject.length === 'number'
}

function toHex (n) {
  if (n < 16) return '0' + n.toString(16)
  return n.toString(16)
}

function utf8ToBytes (str) {
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    var b = str.charCodeAt(i)
    if (b <= 0x7F)
      byteArray.push(str.charCodeAt(i))
    else {
      var start = i
      if (b >= 0xD800 && b <= 0xDFFF) i++
      var h = encodeURIComponent(str.slice(start, i+1)).substr(1).split('%')
      for (var j = 0; j < h.length; j++)
        byteArray.push(parseInt(h[j], 16))
    }
  }
  return byteArray
}

function asciiToBytes (str) {
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    // Node's code seems to be doing this and not & 0x7F..
    byteArray.push(str.charCodeAt(i) & 0xFF)
  }
  return byteArray
}

function utf16leToBytes (str) {
  var c, hi, lo
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    c = str.charCodeAt(i)
    hi = c >> 8
    lo = c % 256
    byteArray.push(lo)
    byteArray.push(hi)
  }

  return byteArray
}

function base64ToBytes (str) {
  return base64.toByteArray(str)
}

function blitBuffer (src, dst, offset, length) {
  var pos
  for (var i = 0; i < length; i++) {
    if ((i + offset >= dst.length) || (i >= src.length))
      break
    dst[i + offset] = src[i]
  }
  return i
}

function decodeUtf8Char (str) {
  try {
    return decodeURIComponent(str)
  } catch (err) {
    return String.fromCharCode(0xFFFD) // UTF 8 invalid char
  }
}

/*
 * We have to make sure that the value is a valid integer. This means that it
 * is non-negative. It has no fractional component and that it does not
 * exceed the maximum allowed value.
 */
function verifuint (value, max) {
  assert(typeof value === 'number', 'cannot write a non-number as a number')
  assert(value >= 0, 'specified a negative value for writing an unsigned value')
  assert(value <= max, 'value is larger than maximum value for type')
  assert(Math.floor(value) === value, 'value has a fractional component')
}

function verifsint (value, max, min) {
  assert(typeof value === 'number', 'cannot write a non-number as a number')
  assert(value <= max, 'value larger than maximum allowed value')
  assert(value >= min, 'value smaller than minimum allowed value')
  assert(Math.floor(value) === value, 'value has a fractional component')
}

function verifIEEE754 (value, max, min) {
  assert(typeof value === 'number', 'cannot write a non-number as a number')
  assert(value <= max, 'value larger than maximum allowed value')
  assert(value >= min, 'value smaller than minimum allowed value')
}

function assert (test, message) {
  if (!test) throw new Error(message || 'Failed assertion')
}

},{"base64-js":13,"ieee754":14}],13:[function(require,module,exports){
var lookup = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

;(function (exports) {
	'use strict';

  var Arr = (typeof Uint8Array !== 'undefined')
    ? Uint8Array
    : Array

	var PLUS   = '+'.charCodeAt(0)
	var SLASH  = '/'.charCodeAt(0)
	var NUMBER = '0'.charCodeAt(0)
	var LOWER  = 'a'.charCodeAt(0)
	var UPPER  = 'A'.charCodeAt(0)

	function decode (elt) {
		var code = elt.charCodeAt(0)
		if (code === PLUS)
			return 62 // '+'
		if (code === SLASH)
			return 63 // '/'
		if (code < NUMBER)
			return -1 //no match
		if (code < NUMBER + 10)
			return code - NUMBER + 26 + 26
		if (code < UPPER + 26)
			return code - UPPER
		if (code < LOWER + 26)
			return code - LOWER + 26
	}

	function b64ToByteArray (b64) {
		var i, j, l, tmp, placeHolders, arr

		if (b64.length % 4 > 0) {
			throw new Error('Invalid string. Length must be a multiple of 4')
		}

		// the number of equal signs (place holders)
		// if there are two placeholders, than the two characters before it
		// represent one byte
		// if there is only one, then the three characters before it represent 2 bytes
		// this is just a cheap hack to not do indexOf twice
		var len = b64.length
		placeHolders = '=' === b64.charAt(len - 2) ? 2 : '=' === b64.charAt(len - 1) ? 1 : 0

		// base64 is 4/3 + up to two characters of the original data
		arr = new Arr(b64.length * 3 / 4 - placeHolders)

		// if there are placeholders, only get up to the last complete 4 chars
		l = placeHolders > 0 ? b64.length - 4 : b64.length

		var L = 0

		function push (v) {
			arr[L++] = v
		}

		for (i = 0, j = 0; i < l; i += 4, j += 3) {
			tmp = (decode(b64.charAt(i)) << 18) | (decode(b64.charAt(i + 1)) << 12) | (decode(b64.charAt(i + 2)) << 6) | decode(b64.charAt(i + 3))
			push((tmp & 0xFF0000) >> 16)
			push((tmp & 0xFF00) >> 8)
			push(tmp & 0xFF)
		}

		if (placeHolders === 2) {
			tmp = (decode(b64.charAt(i)) << 2) | (decode(b64.charAt(i + 1)) >> 4)
			push(tmp & 0xFF)
		} else if (placeHolders === 1) {
			tmp = (decode(b64.charAt(i)) << 10) | (decode(b64.charAt(i + 1)) << 4) | (decode(b64.charAt(i + 2)) >> 2)
			push((tmp >> 8) & 0xFF)
			push(tmp & 0xFF)
		}

		return arr
	}

	function uint8ToBase64 (uint8) {
		var i,
			extraBytes = uint8.length % 3, // if we have 1 byte left, pad 2 bytes
			output = "",
			temp, length

		function encode (num) {
			return lookup.charAt(num)
		}

		function tripletToBase64 (num) {
			return encode(num >> 18 & 0x3F) + encode(num >> 12 & 0x3F) + encode(num >> 6 & 0x3F) + encode(num & 0x3F)
		}

		// go through the array every three bytes, we'll deal with trailing stuff later
		for (i = 0, length = uint8.length - extraBytes; i < length; i += 3) {
			temp = (uint8[i] << 16) + (uint8[i + 1] << 8) + (uint8[i + 2])
			output += tripletToBase64(temp)
		}

		// pad the end with zeros, but make sure to not forget the extra bytes
		switch (extraBytes) {
			case 1:
				temp = uint8[uint8.length - 1]
				output += encode(temp >> 2)
				output += encode((temp << 4) & 0x3F)
				output += '=='
				break
			case 2:
				temp = (uint8[uint8.length - 2] << 8) + (uint8[uint8.length - 1])
				output += encode(temp >> 10)
				output += encode((temp >> 4) & 0x3F)
				output += encode((temp << 2) & 0x3F)
				output += '='
				break
		}

		return output
	}

	exports.toByteArray = b64ToByteArray
	exports.fromByteArray = uint8ToBase64
}(typeof exports === 'undefined' ? (this.base64js = {}) : exports))

},{}],14:[function(require,module,exports){
exports.read = function(buffer, offset, isLE, mLen, nBytes) {
  var e, m,
      eLen = nBytes * 8 - mLen - 1,
      eMax = (1 << eLen) - 1,
      eBias = eMax >> 1,
      nBits = -7,
      i = isLE ? (nBytes - 1) : 0,
      d = isLE ? -1 : 1,
      s = buffer[offset + i];

  i += d;

  e = s & ((1 << (-nBits)) - 1);
  s >>= (-nBits);
  nBits += eLen;
  for (; nBits > 0; e = e * 256 + buffer[offset + i], i += d, nBits -= 8);

  m = e & ((1 << (-nBits)) - 1);
  e >>= (-nBits);
  nBits += mLen;
  for (; nBits > 0; m = m * 256 + buffer[offset + i], i += d, nBits -= 8);

  if (e === 0) {
    e = 1 - eBias;
  } else if (e === eMax) {
    return m ? NaN : ((s ? -1 : 1) * Infinity);
  } else {
    m = m + Math.pow(2, mLen);
    e = e - eBias;
  }
  return (s ? -1 : 1) * m * Math.pow(2, e - mLen);
};

exports.write = function(buffer, value, offset, isLE, mLen, nBytes) {
  var e, m, c,
      eLen = nBytes * 8 - mLen - 1,
      eMax = (1 << eLen) - 1,
      eBias = eMax >> 1,
      rt = (mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0),
      i = isLE ? 0 : (nBytes - 1),
      d = isLE ? 1 : -1,
      s = value < 0 || (value === 0 && 1 / value < 0) ? 1 : 0;

  value = Math.abs(value);

  if (isNaN(value) || value === Infinity) {
    m = isNaN(value) ? 1 : 0;
    e = eMax;
  } else {
    e = Math.floor(Math.log(value) / Math.LN2);
    if (value * (c = Math.pow(2, -e)) < 1) {
      e--;
      c *= 2;
    }
    if (e + eBias >= 1) {
      value += rt / c;
    } else {
      value += rt * Math.pow(2, 1 - eBias);
    }
    if (value * c >= 2) {
      e++;
      c /= 2;
    }

    if (e + eBias >= eMax) {
      m = 0;
      e = eMax;
    } else if (e + eBias >= 1) {
      m = (value * c - 1) * Math.pow(2, mLen);
      e = e + eBias;
    } else {
      m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen);
      e = 0;
    }
  }

  for (; mLen >= 8; buffer[offset + i] = m & 0xff, i += d, m /= 256, mLen -= 8);

  e = (e << mLen) | m;
  eLen += mLen;
  for (; eLen > 0; buffer[offset + i] = e & 0xff, i += d, e /= 256, eLen -= 8);

  buffer[offset + i - d] |= s * 128;
};

},{}],15:[function(require,module,exports){
if (typeof Object.create === 'function') {
  // implementation from standard node.js 'util' module
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    ctor.prototype = Object.create(superCtor.prototype, {
      constructor: {
        value: ctor,
        enumerable: false,
        writable: true,
        configurable: true
      }
    });
  };
} else {
  // old school shim for old browsers
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    var TempCtor = function () {}
    TempCtor.prototype = superCtor.prototype
    ctor.prototype = new TempCtor()
    ctor.prototype.constructor = ctor
  }
}

},{}],16:[function(require,module,exports){
// shim for using process in browser

var process = module.exports = {};

process.nextTick = (function () {
    var canSetImmediate = typeof window !== 'undefined'
    && window.setImmediate;
    var canPost = typeof window !== 'undefined'
    && window.postMessage && window.addEventListener
    ;

    if (canSetImmediate) {
        return function (f) { return window.setImmediate(f) };
    }

    if (canPost) {
        var queue = [];
        window.addEventListener('message', function (ev) {
            var source = ev.source;
            if ((source === window || source === null) && ev.data === 'process-tick') {
                ev.stopPropagation();
                if (queue.length > 0) {
                    var fn = queue.shift();
                    fn();
                }
            }
        }, true);

        return function nextTick(fn) {
            queue.push(fn);
            window.postMessage('process-tick', '*');
        };
    }

    return function nextTick(fn) {
        setTimeout(fn, 0);
    };
})();

process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;

process.binding = function (name) {
    throw new Error('process.binding is not supported');
}

// TODO(shtylman)
process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};

},{}],17:[function(require,module,exports){
module.exports = function isBuffer(arg) {
  return arg && typeof arg === 'object'
    && typeof arg.copy === 'function'
    && typeof arg.fill === 'function'
    && typeof arg.readUInt8 === 'function';
}
},{}],18:[function(require,module,exports){
(function (process,global){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var formatRegExp = /%[sdj%]/g;
exports.format = function(f) {
  if (!isString(f)) {
    var objects = [];
    for (var i = 0; i < arguments.length; i++) {
      objects.push(inspect(arguments[i]));
    }
    return objects.join(' ');
  }

  var i = 1;
  var args = arguments;
  var len = args.length;
  var str = String(f).replace(formatRegExp, function(x) {
    if (x === '%%') return '%';
    if (i >= len) return x;
    switch (x) {
      case '%s': return String(args[i++]);
      case '%d': return Number(args[i++]);
      case '%j':
        try {
          return JSON.stringify(args[i++]);
        } catch (_) {
          return '[Circular]';
        }
      default:
        return x;
    }
  });
  for (var x = args[i]; i < len; x = args[++i]) {
    if (isNull(x) || !isObject(x)) {
      str += ' ' + x;
    } else {
      str += ' ' + inspect(x);
    }
  }
  return str;
};


// Mark that a method should not be used.
// Returns a modified function which warns once by default.
// If --no-deprecation is set, then it is a no-op.
exports.deprecate = function(fn, msg) {
  // Allow for deprecating things in the process of starting up.
  if (isUndefined(global.process)) {
    return function() {
      return exports.deprecate(fn, msg).apply(this, arguments);
    };
  }

  if (process.noDeprecation === true) {
    return fn;
  }

  var warned = false;
  function deprecated() {
    if (!warned) {
      if (process.throwDeprecation) {
        throw new Error(msg);
      } else if (process.traceDeprecation) {
        console.trace(msg);
      } else {
        console.error(msg);
      }
      warned = true;
    }
    return fn.apply(this, arguments);
  }

  return deprecated;
};


var debugs = {};
var debugEnviron;
exports.debuglog = function(set) {
  if (isUndefined(debugEnviron))
    debugEnviron = process.env.NODE_DEBUG || '';
  set = set.toUpperCase();
  if (!debugs[set]) {
    if (new RegExp('\\b' + set + '\\b', 'i').test(debugEnviron)) {
      var pid = process.pid;
      debugs[set] = function() {
        var msg = exports.format.apply(exports, arguments);
        console.error('%s %d: %s', set, pid, msg);
      };
    } else {
      debugs[set] = function() {};
    }
  }
  return debugs[set];
};


/**
 * Echos the value of a value. Trys to print the value out
 * in the best way possible given the different types.
 *
 * @param {Object} obj The object to print out.
 * @param {Object} opts Optional options object that alters the output.
 */
/* legacy: obj, showHidden, depth, colors*/
function inspect(obj, opts) {
  // default options
  var ctx = {
    seen: [],
    stylize: stylizeNoColor
  };
  // legacy...
  if (arguments.length >= 3) ctx.depth = arguments[2];
  if (arguments.length >= 4) ctx.colors = arguments[3];
  if (isBoolean(opts)) {
    // legacy...
    ctx.showHidden = opts;
  } else if (opts) {
    // got an "options" object
    exports._extend(ctx, opts);
  }
  // set default options
  if (isUndefined(ctx.showHidden)) ctx.showHidden = false;
  if (isUndefined(ctx.depth)) ctx.depth = 2;
  if (isUndefined(ctx.colors)) ctx.colors = false;
  if (isUndefined(ctx.customInspect)) ctx.customInspect = true;
  if (ctx.colors) ctx.stylize = stylizeWithColor;
  return formatValue(ctx, obj, ctx.depth);
}
exports.inspect = inspect;


// http://en.wikipedia.org/wiki/ANSI_escape_code#graphics
inspect.colors = {
  'bold' : [1, 22],
  'italic' : [3, 23],
  'underline' : [4, 24],
  'inverse' : [7, 27],
  'white' : [37, 39],
  'grey' : [90, 39],
  'black' : [30, 39],
  'blue' : [34, 39],
  'cyan' : [36, 39],
  'green' : [32, 39],
  'magenta' : [35, 39],
  'red' : [31, 39],
  'yellow' : [33, 39]
};

// Don't use 'blue' not visible on cmd.exe
inspect.styles = {
  'special': 'cyan',
  'number': 'yellow',
  'boolean': 'yellow',
  'undefined': 'grey',
  'null': 'bold',
  'string': 'green',
  'date': 'magenta',
  // "name": intentionally not styling
  'regexp': 'red'
};


function stylizeWithColor(str, styleType) {
  var style = inspect.styles[styleType];

  if (style) {
    return '\u001b[' + inspect.colors[style][0] + 'm' + str +
           '\u001b[' + inspect.colors[style][1] + 'm';
  } else {
    return str;
  }
}


function stylizeNoColor(str, styleType) {
  return str;
}


function arrayToHash(array) {
  var hash = {};

  array.forEach(function(val, idx) {
    hash[val] = true;
  });

  return hash;
}


function formatValue(ctx, value, recurseTimes) {
  // Provide a hook for user-specified inspect functions.
  // Check that value is an object with an inspect function on it
  if (ctx.customInspect &&
      value &&
      isFunction(value.inspect) &&
      // Filter out the util module, it's inspect function is special
      value.inspect !== exports.inspect &&
      // Also filter out any prototype objects using the circular check.
      !(value.constructor && value.constructor.prototype === value)) {
    var ret = value.inspect(recurseTimes, ctx);
    if (!isString(ret)) {
      ret = formatValue(ctx, ret, recurseTimes);
    }
    return ret;
  }

  // Primitive types cannot have properties
  var primitive = formatPrimitive(ctx, value);
  if (primitive) {
    return primitive;
  }

  // Look up the keys of the object.
  var keys = Object.keys(value);
  var visibleKeys = arrayToHash(keys);

  if (ctx.showHidden) {
    keys = Object.getOwnPropertyNames(value);
  }

  // IE doesn't make error fields non-enumerable
  // http://msdn.microsoft.com/en-us/library/ie/dww52sbt(v=vs.94).aspx
  if (isError(value)
      && (keys.indexOf('message') >= 0 || keys.indexOf('description') >= 0)) {
    return formatError(value);
  }

  // Some type of object without properties can be shortcutted.
  if (keys.length === 0) {
    if (isFunction(value)) {
      var name = value.name ? ': ' + value.name : '';
      return ctx.stylize('[Function' + name + ']', 'special');
    }
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    }
    if (isDate(value)) {
      return ctx.stylize(Date.prototype.toString.call(value), 'date');
    }
    if (isError(value)) {
      return formatError(value);
    }
  }

  var base = '', array = false, braces = ['{', '}'];

  // Make Array say that they are Array
  if (isArray(value)) {
    array = true;
    braces = ['[', ']'];
  }

  // Make functions say that they are functions
  if (isFunction(value)) {
    var n = value.name ? ': ' + value.name : '';
    base = ' [Function' + n + ']';
  }

  // Make RegExps say that they are RegExps
  if (isRegExp(value)) {
    base = ' ' + RegExp.prototype.toString.call(value);
  }

  // Make dates with properties first say the date
  if (isDate(value)) {
    base = ' ' + Date.prototype.toUTCString.call(value);
  }

  // Make error with message first say the error
  if (isError(value)) {
    base = ' ' + formatError(value);
  }

  if (keys.length === 0 && (!array || value.length == 0)) {
    return braces[0] + base + braces[1];
  }

  if (recurseTimes < 0) {
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    } else {
      return ctx.stylize('[Object]', 'special');
    }
  }

  ctx.seen.push(value);

  var output;
  if (array) {
    output = formatArray(ctx, value, recurseTimes, visibleKeys, keys);
  } else {
    output = keys.map(function(key) {
      return formatProperty(ctx, value, recurseTimes, visibleKeys, key, array);
    });
  }

  ctx.seen.pop();

  return reduceToSingleString(output, base, braces);
}


function formatPrimitive(ctx, value) {
  if (isUndefined(value))
    return ctx.stylize('undefined', 'undefined');
  if (isString(value)) {
    var simple = '\'' + JSON.stringify(value).replace(/^"|"$/g, '')
                                             .replace(/'/g, "\\'")
                                             .replace(/\\"/g, '"') + '\'';
    return ctx.stylize(simple, 'string');
  }
  if (isNumber(value))
    return ctx.stylize('' + value, 'number');
  if (isBoolean(value))
    return ctx.stylize('' + value, 'boolean');
  // For some reason typeof null is "object", so special case here.
  if (isNull(value))
    return ctx.stylize('null', 'null');
}


function formatError(value) {
  return '[' + Error.prototype.toString.call(value) + ']';
}


function formatArray(ctx, value, recurseTimes, visibleKeys, keys) {
  var output = [];
  for (var i = 0, l = value.length; i < l; ++i) {
    if (hasOwnProperty(value, String(i))) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          String(i), true));
    } else {
      output.push('');
    }
  }
  keys.forEach(function(key) {
    if (!key.match(/^\d+$/)) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          key, true));
    }
  });
  return output;
}


function formatProperty(ctx, value, recurseTimes, visibleKeys, key, array) {
  var name, str, desc;
  desc = Object.getOwnPropertyDescriptor(value, key) || { value: value[key] };
  if (desc.get) {
    if (desc.set) {
      str = ctx.stylize('[Getter/Setter]', 'special');
    } else {
      str = ctx.stylize('[Getter]', 'special');
    }
  } else {
    if (desc.set) {
      str = ctx.stylize('[Setter]', 'special');
    }
  }
  if (!hasOwnProperty(visibleKeys, key)) {
    name = '[' + key + ']';
  }
  if (!str) {
    if (ctx.seen.indexOf(desc.value) < 0) {
      if (isNull(recurseTimes)) {
        str = formatValue(ctx, desc.value, null);
      } else {
        str = formatValue(ctx, desc.value, recurseTimes - 1);
      }
      if (str.indexOf('\n') > -1) {
        if (array) {
          str = str.split('\n').map(function(line) {
            return '  ' + line;
          }).join('\n').substr(2);
        } else {
          str = '\n' + str.split('\n').map(function(line) {
            return '   ' + line;
          }).join('\n');
        }
      }
    } else {
      str = ctx.stylize('[Circular]', 'special');
    }
  }
  if (isUndefined(name)) {
    if (array && key.match(/^\d+$/)) {
      return str;
    }
    name = JSON.stringify('' + key);
    if (name.match(/^"([a-zA-Z_][a-zA-Z_0-9]*)"$/)) {
      name = name.substr(1, name.length - 2);
      name = ctx.stylize(name, 'name');
    } else {
      name = name.replace(/'/g, "\\'")
                 .replace(/\\"/g, '"')
                 .replace(/(^"|"$)/g, "'");
      name = ctx.stylize(name, 'string');
    }
  }

  return name + ': ' + str;
}


function reduceToSingleString(output, base, braces) {
  var numLinesEst = 0;
  var length = output.reduce(function(prev, cur) {
    numLinesEst++;
    if (cur.indexOf('\n') >= 0) numLinesEst++;
    return prev + cur.replace(/\u001b\[\d\d?m/g, '').length + 1;
  }, 0);

  if (length > 60) {
    return braces[0] +
           (base === '' ? '' : base + '\n ') +
           ' ' +
           output.join(',\n  ') +
           ' ' +
           braces[1];
  }

  return braces[0] + base + ' ' + output.join(', ') + ' ' + braces[1];
}


// NOTE: These type checking functions intentionally don't use `instanceof`
// because it is fragile and can be easily faked with `Object.create()`.
function isArray(ar) {
  return Array.isArray(ar);
}
exports.isArray = isArray;

function isBoolean(arg) {
  return typeof arg === 'boolean';
}
exports.isBoolean = isBoolean;

function isNull(arg) {
  return arg === null;
}
exports.isNull = isNull;

function isNullOrUndefined(arg) {
  return arg == null;
}
exports.isNullOrUndefined = isNullOrUndefined;

function isNumber(arg) {
  return typeof arg === 'number';
}
exports.isNumber = isNumber;

function isString(arg) {
  return typeof arg === 'string';
}
exports.isString = isString;

function isSymbol(arg) {
  return typeof arg === 'symbol';
}
exports.isSymbol = isSymbol;

function isUndefined(arg) {
  return arg === void 0;
}
exports.isUndefined = isUndefined;

function isRegExp(re) {
  return isObject(re) && objectToString(re) === '[object RegExp]';
}
exports.isRegExp = isRegExp;

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}
exports.isObject = isObject;

function isDate(d) {
  return isObject(d) && objectToString(d) === '[object Date]';
}
exports.isDate = isDate;

function isError(e) {
  return isObject(e) &&
      (objectToString(e) === '[object Error]' || e instanceof Error);
}
exports.isError = isError;

function isFunction(arg) {
  return typeof arg === 'function';
}
exports.isFunction = isFunction;

function isPrimitive(arg) {
  return arg === null ||
         typeof arg === 'boolean' ||
         typeof arg === 'number' ||
         typeof arg === 'string' ||
         typeof arg === 'symbol' ||  // ES6 symbol
         typeof arg === 'undefined';
}
exports.isPrimitive = isPrimitive;

exports.isBuffer = require('./support/isBuffer');

function objectToString(o) {
  return Object.prototype.toString.call(o);
}


function pad(n) {
  return n < 10 ? '0' + n.toString(10) : n.toString(10);
}


var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep',
              'Oct', 'Nov', 'Dec'];

// 26 Feb 16:19:34
function timestamp() {
  var d = new Date();
  var time = [pad(d.getHours()),
              pad(d.getMinutes()),
              pad(d.getSeconds())].join(':');
  return [d.getDate(), months[d.getMonth()], time].join(' ');
}


// log is just a thin wrapper to console.log that prepends a timestamp
exports.log = function() {
  console.log('%s - %s', timestamp(), exports.format.apply(exports, arguments));
};


/**
 * Inherit the prototype methods from one constructor into another.
 *
 * The Function.prototype.inherits from lang.js rewritten as a standalone
 * function (not on Function.prototype). NOTE: If this file is to be loaded
 * during bootstrapping this function needs to be rewritten using some native
 * functions as prototype setup using normal JavaScript does not work as
 * expected during bootstrapping (see mirror.js in r114903).
 *
 * @param {function} ctor Constructor function which needs to inherit the
 *     prototype.
 * @param {function} superCtor Constructor function to inherit prototype from.
 */
exports.inherits = require('inherits');

exports._extend = function(origin, add) {
  // Don't do anything if add isn't an object
  if (!add || !isObject(add)) return origin;

  var keys = Object.keys(add);
  var i = keys.length;
  while (i--) {
    origin[keys[i]] = add[keys[i]];
  }
  return origin;
};

function hasOwnProperty(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

}).call(this,require("FWaASH"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./support/isBuffer":17,"FWaASH":16,"inherits":15}],19:[function(require,module,exports){
(function (Buffer){
(function () {
  "use strict";

  function btoa(str) {
    var buffer
      ;

    if (str instanceof Buffer) {
      buffer = str;
    } else {
      buffer = new Buffer(str.toString(), 'binary');
    }

    return buffer.toString('base64');
  }

  module.exports = btoa;
}());

}).call(this,require("buffer").Buffer)
},{"buffer":12}],20:[function(require,module,exports){
/*!
 * jQuery JavaScript Library v2.1.1
 * http://jquery.com/
 *
 * Includes Sizzle.js
 * http://sizzlejs.com/
 *
 * Copyright 2005, 2014 jQuery Foundation, Inc. and other contributors
 * Released under the MIT license
 * http://jquery.org/license
 *
 * Date: 2014-05-01T17:11Z
 */

(function( global, factory ) {

	if ( typeof module === "object" && typeof module.exports === "object" ) {
		// For CommonJS and CommonJS-like environments where a proper window is present,
		// execute the factory and get jQuery
		// For environments that do not inherently posses a window with a document
		// (such as Node.js), expose a jQuery-making factory as module.exports
		// This accentuates the need for the creation of a real window
		// e.g. var jQuery = require("jquery")(window);
		// See ticket #14549 for more info
		module.exports = global.document ?
			factory( global, true ) :
			function( w ) {
				if ( !w.document ) {
					throw new Error( "jQuery requires a window with a document" );
				}
				return factory( w );
			};
	} else {
		factory( global );
	}

// Pass this if window is not defined yet
}(typeof window !== "undefined" ? window : this, function( window, noGlobal ) {

// Can't do this because several apps including ASP.NET trace
// the stack via arguments.caller.callee and Firefox dies if
// you try to trace through "use strict" call chains. (#13335)
// Support: Firefox 18+
//

var arr = [];

var slice = arr.slice;

var concat = arr.concat;

var push = arr.push;

var indexOf = arr.indexOf;

var class2type = {};

var toString = class2type.toString;

var hasOwn = class2type.hasOwnProperty;

var support = {};



var
	// Use the correct document accordingly with window argument (sandbox)
	document = window.document,

	version = "2.1.1",

	// Define a local copy of jQuery
	jQuery = function( selector, context ) {
		// The jQuery object is actually just the init constructor 'enhanced'
		// Need init if jQuery is called (just allow error to be thrown if not included)
		return new jQuery.fn.init( selector, context );
	},

	// Support: Android<4.1
	// Make sure we trim BOM and NBSP
	rtrim = /^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g,

	// Matches dashed string for camelizing
	rmsPrefix = /^-ms-/,
	rdashAlpha = /-([\da-z])/gi,

	// Used by jQuery.camelCase as callback to replace()
	fcamelCase = function( all, letter ) {
		return letter.toUpperCase();
	};

jQuery.fn = jQuery.prototype = {
	// The current version of jQuery being used
	jquery: version,

	constructor: jQuery,

	// Start with an empty selector
	selector: "",

	// The default length of a jQuery object is 0
	length: 0,

	toArray: function() {
		return slice.call( this );
	},

	// Get the Nth element in the matched element set OR
	// Get the whole matched element set as a clean array
	get: function( num ) {
		return num != null ?

			// Return just the one element from the set
			( num < 0 ? this[ num + this.length ] : this[ num ] ) :

			// Return all the elements in a clean array
			slice.call( this );
	},

	// Take an array of elements and push it onto the stack
	// (returning the new matched element set)
	pushStack: function( elems ) {

		// Build a new jQuery matched element set
		var ret = jQuery.merge( this.constructor(), elems );

		// Add the old object onto the stack (as a reference)
		ret.prevObject = this;
		ret.context = this.context;

		// Return the newly-formed element set
		return ret;
	},

	// Execute a callback for every element in the matched set.
	// (You can seed the arguments with an array of args, but this is
	// only used internally.)
	each: function( callback, args ) {
		return jQuery.each( this, callback, args );
	},

	map: function( callback ) {
		return this.pushStack( jQuery.map(this, function( elem, i ) {
			return callback.call( elem, i, elem );
		}));
	},

	slice: function() {
		return this.pushStack( slice.apply( this, arguments ) );
	},

	first: function() {
		return this.eq( 0 );
	},

	last: function() {
		return this.eq( -1 );
	},

	eq: function( i ) {
		var len = this.length,
			j = +i + ( i < 0 ? len : 0 );
		return this.pushStack( j >= 0 && j < len ? [ this[j] ] : [] );
	},

	end: function() {
		return this.prevObject || this.constructor(null);
	},

	// For internal use only.
	// Behaves like an Array's method, not like a jQuery method.
	push: push,
	sort: arr.sort,
	splice: arr.splice
};

jQuery.extend = jQuery.fn.extend = function() {
	var options, name, src, copy, copyIsArray, clone,
		target = arguments[0] || {},
		i = 1,
		length = arguments.length,
		deep = false;

	// Handle a deep copy situation
	if ( typeof target === "boolean" ) {
		deep = target;

		// skip the boolean and the target
		target = arguments[ i ] || {};
		i++;
	}

	// Handle case when target is a string or something (possible in deep copy)
	if ( typeof target !== "object" && !jQuery.isFunction(target) ) {
		target = {};
	}

	// extend jQuery itself if only one argument is passed
	if ( i === length ) {
		target = this;
		i--;
	}

	for ( ; i < length; i++ ) {
		// Only deal with non-null/undefined values
		if ( (options = arguments[ i ]) != null ) {
			// Extend the base object
			for ( name in options ) {
				src = target[ name ];
				copy = options[ name ];

				// Prevent never-ending loop
				if ( target === copy ) {
					continue;
				}

				// Recurse if we're merging plain objects or arrays
				if ( deep && copy && ( jQuery.isPlainObject(copy) || (copyIsArray = jQuery.isArray(copy)) ) ) {
					if ( copyIsArray ) {
						copyIsArray = false;
						clone = src && jQuery.isArray(src) ? src : [];

					} else {
						clone = src && jQuery.isPlainObject(src) ? src : {};
					}

					// Never move original objects, clone them
					target[ name ] = jQuery.extend( deep, clone, copy );

				// Don't bring in undefined values
				} else if ( copy !== undefined ) {
					target[ name ] = copy;
				}
			}
		}
	}

	// Return the modified object
	return target;
};

jQuery.extend({
	// Unique for each copy of jQuery on the page
	expando: "jQuery" + ( version + Math.random() ).replace( /\D/g, "" ),

	// Assume jQuery is ready without the ready module
	isReady: true,

	error: function( msg ) {
		throw new Error( msg );
	},

	noop: function() {},

	// See test/unit/core.js for details concerning isFunction.
	// Since version 1.3, DOM methods and functions like alert
	// aren't supported. They return false on IE (#2968).
	isFunction: function( obj ) {
		return jQuery.type(obj) === "function";
	},

	isArray: Array.isArray,

	isWindow: function( obj ) {
		return obj != null && obj === obj.window;
	},

	isNumeric: function( obj ) {
		// parseFloat NaNs numeric-cast false positives (null|true|false|"")
		// ...but misinterprets leading-number strings, particularly hex literals ("0x...")
		// subtraction forces infinities to NaN
		return !jQuery.isArray( obj ) && obj - parseFloat( obj ) >= 0;
	},

	isPlainObject: function( obj ) {
		// Not plain objects:
		// - Any object or value whose internal [[Class]] property is not "[object Object]"
		// - DOM nodes
		// - window
		if ( jQuery.type( obj ) !== "object" || obj.nodeType || jQuery.isWindow( obj ) ) {
			return false;
		}

		if ( obj.constructor &&
				!hasOwn.call( obj.constructor.prototype, "isPrototypeOf" ) ) {
			return false;
		}

		// If the function hasn't returned already, we're confident that
		// |obj| is a plain object, created by {} or constructed with new Object
		return true;
	},

	isEmptyObject: function( obj ) {
		var name;
		for ( name in obj ) {
			return false;
		}
		return true;
	},

	type: function( obj ) {
		if ( obj == null ) {
			return obj + "";
		}
		// Support: Android < 4.0, iOS < 6 (functionish RegExp)
		return typeof obj === "object" || typeof obj === "function" ?
			class2type[ toString.call(obj) ] || "object" :
			typeof obj;
	},

	// Evaluates a script in a global context
	globalEval: function( code ) {
		var script,
			indirect = eval;

		code = jQuery.trim( code );

		if ( code ) {
			// If the code includes a valid, prologue position
			// strict mode pragma, execute code by injecting a
			// script tag into the document.
			if ( code.indexOf("use strict") === 1 ) {
				script = document.createElement("script");
				script.text = code;
				document.head.appendChild( script ).parentNode.removeChild( script );
			} else {
			// Otherwise, avoid the DOM node creation, insertion
			// and removal by using an indirect global eval
				indirect( code );
			}
		}
	},

	// Convert dashed to camelCase; used by the css and data modules
	// Microsoft forgot to hump their vendor prefix (#9572)
	camelCase: function( string ) {
		return string.replace( rmsPrefix, "ms-" ).replace( rdashAlpha, fcamelCase );
	},

	nodeName: function( elem, name ) {
		return elem.nodeName && elem.nodeName.toLowerCase() === name.toLowerCase();
	},

	// args is for internal usage only
	each: function( obj, callback, args ) {
		var value,
			i = 0,
			length = obj.length,
			isArray = isArraylike( obj );

		if ( args ) {
			if ( isArray ) {
				for ( ; i < length; i++ ) {
					value = callback.apply( obj[ i ], args );

					if ( value === false ) {
						break;
					}
				}
			} else {
				for ( i in obj ) {
					value = callback.apply( obj[ i ], args );

					if ( value === false ) {
						break;
					}
				}
			}

		// A special, fast, case for the most common use of each
		} else {
			if ( isArray ) {
				for ( ; i < length; i++ ) {
					value = callback.call( obj[ i ], i, obj[ i ] );

					if ( value === false ) {
						break;
					}
				}
			} else {
				for ( i in obj ) {
					value = callback.call( obj[ i ], i, obj[ i ] );

					if ( value === false ) {
						break;
					}
				}
			}
		}

		return obj;
	},

	// Support: Android<4.1
	trim: function( text ) {
		return text == null ?
			"" :
			( text + "" ).replace( rtrim, "" );
	},

	// results is for internal usage only
	makeArray: function( arr, results ) {
		var ret = results || [];

		if ( arr != null ) {
			if ( isArraylike( Object(arr) ) ) {
				jQuery.merge( ret,
					typeof arr === "string" ?
					[ arr ] : arr
				);
			} else {
				push.call( ret, arr );
			}
		}

		return ret;
	},

	inArray: function( elem, arr, i ) {
		return arr == null ? -1 : indexOf.call( arr, elem, i );
	},

	merge: function( first, second ) {
		var len = +second.length,
			j = 0,
			i = first.length;

		for ( ; j < len; j++ ) {
			first[ i++ ] = second[ j ];
		}

		first.length = i;

		return first;
	},

	grep: function( elems, callback, invert ) {
		var callbackInverse,
			matches = [],
			i = 0,
			length = elems.length,
			callbackExpect = !invert;

		// Go through the array, only saving the items
		// that pass the validator function
		for ( ; i < length; i++ ) {
			callbackInverse = !callback( elems[ i ], i );
			if ( callbackInverse !== callbackExpect ) {
				matches.push( elems[ i ] );
			}
		}

		return matches;
	},

	// arg is for internal usage only
	map: function( elems, callback, arg ) {
		var value,
			i = 0,
			length = elems.length,
			isArray = isArraylike( elems ),
			ret = [];

		// Go through the array, translating each of the items to their new values
		if ( isArray ) {
			for ( ; i < length; i++ ) {
				value = callback( elems[ i ], i, arg );

				if ( value != null ) {
					ret.push( value );
				}
			}

		// Go through every key on the object,
		} else {
			for ( i in elems ) {
				value = callback( elems[ i ], i, arg );

				if ( value != null ) {
					ret.push( value );
				}
			}
		}

		// Flatten any nested arrays
		return concat.apply( [], ret );
	},

	// A global GUID counter for objects
	guid: 1,

	// Bind a function to a context, optionally partially applying any
	// arguments.
	proxy: function( fn, context ) {
		var tmp, args, proxy;

		if ( typeof context === "string" ) {
			tmp = fn[ context ];
			context = fn;
			fn = tmp;
		}

		// Quick check to determine if target is callable, in the spec
		// this throws a TypeError, but we will just return undefined.
		if ( !jQuery.isFunction( fn ) ) {
			return undefined;
		}

		// Simulated bind
		args = slice.call( arguments, 2 );
		proxy = function() {
			return fn.apply( context || this, args.concat( slice.call( arguments ) ) );
		};

		// Set the guid of unique handler to the same of original handler, so it can be removed
		proxy.guid = fn.guid = fn.guid || jQuery.guid++;

		return proxy;
	},

	now: Date.now,

	// jQuery.support is not used in Core but other projects attach their
	// properties to it so it needs to exist.
	support: support
});

// Populate the class2type map
jQuery.each("Boolean Number String Function Array Date RegExp Object Error".split(" "), function(i, name) {
	class2type[ "[object " + name + "]" ] = name.toLowerCase();
});

function isArraylike( obj ) {
	var length = obj.length,
		type = jQuery.type( obj );

	if ( type === "function" || jQuery.isWindow( obj ) ) {
		return false;
	}

	if ( obj.nodeType === 1 && length ) {
		return true;
	}

	return type === "array" || length === 0 ||
		typeof length === "number" && length > 0 && ( length - 1 ) in obj;
}
var Sizzle =
/*!
 * Sizzle CSS Selector Engine v1.10.19
 * http://sizzlejs.com/
 *
 * Copyright 2013 jQuery Foundation, Inc. and other contributors
 * Released under the MIT license
 * http://jquery.org/license
 *
 * Date: 2014-04-18
 */
(function( window ) {

var i,
	support,
	Expr,
	getText,
	isXML,
	tokenize,
	compile,
	select,
	outermostContext,
	sortInput,
	hasDuplicate,

	// Local document vars
	setDocument,
	document,
	docElem,
	documentIsHTML,
	rbuggyQSA,
	rbuggyMatches,
	matches,
	contains,

	// Instance-specific data
	expando = "sizzle" + -(new Date()),
	preferredDoc = window.document,
	dirruns = 0,
	done = 0,
	classCache = createCache(),
	tokenCache = createCache(),
	compilerCache = createCache(),
	sortOrder = function( a, b ) {
		if ( a === b ) {
			hasDuplicate = true;
		}
		return 0;
	},

	// General-purpose constants
	strundefined = typeof undefined,
	MAX_NEGATIVE = 1 << 31,

	// Instance methods
	hasOwn = ({}).hasOwnProperty,
	arr = [],
	pop = arr.pop,
	push_native = arr.push,
	push = arr.push,
	slice = arr.slice,
	// Use a stripped-down indexOf if we can't use a native one
	indexOf = arr.indexOf || function( elem ) {
		var i = 0,
			len = this.length;
		for ( ; i < len; i++ ) {
			if ( this[i] === elem ) {
				return i;
			}
		}
		return -1;
	},

	booleans = "checked|selected|async|autofocus|autoplay|controls|defer|disabled|hidden|ismap|loop|multiple|open|readonly|required|scoped",

	// Regular expressions

	// Whitespace characters http://www.w3.org/TR/css3-selectors/#whitespace
	whitespace = "[\\x20\\t\\r\\n\\f]",
	// http://www.w3.org/TR/css3-syntax/#characters
	characterEncoding = "(?:\\\\.|[\\w-]|[^\\x00-\\xa0])+",

	// Loosely modeled on CSS identifier characters
	// An unquoted value should be a CSS identifier http://www.w3.org/TR/css3-selectors/#attribute-selectors
	// Proper syntax: http://www.w3.org/TR/CSS21/syndata.html#value-def-identifier
	identifier = characterEncoding.replace( "w", "w#" ),

	// Attribute selectors: http://www.w3.org/TR/selectors/#attribute-selectors
	attributes = "\\[" + whitespace + "*(" + characterEncoding + ")(?:" + whitespace +
		// Operator (capture 2)
		"*([*^$|!~]?=)" + whitespace +
		// "Attribute values must be CSS identifiers [capture 5] or strings [capture 3 or capture 4]"
		"*(?:'((?:\\\\.|[^\\\\'])*)'|\"((?:\\\\.|[^\\\\\"])*)\"|(" + identifier + "))|)" + whitespace +
		"*\\]",

	pseudos = ":(" + characterEncoding + ")(?:\\((" +
		// To reduce the number of selectors needing tokenize in the preFilter, prefer arguments:
		// 1. quoted (capture 3; capture 4 or capture 5)
		"('((?:\\\\.|[^\\\\'])*)'|\"((?:\\\\.|[^\\\\\"])*)\")|" +
		// 2. simple (capture 6)
		"((?:\\\\.|[^\\\\()[\\]]|" + attributes + ")*)|" +
		// 3. anything else (capture 2)
		".*" +
		")\\)|)",

	// Leading and non-escaped trailing whitespace, capturing some non-whitespace characters preceding the latter
	rtrim = new RegExp( "^" + whitespace + "+|((?:^|[^\\\\])(?:\\\\.)*)" + whitespace + "+$", "g" ),

	rcomma = new RegExp( "^" + whitespace + "*," + whitespace + "*" ),
	rcombinators = new RegExp( "^" + whitespace + "*([>+~]|" + whitespace + ")" + whitespace + "*" ),

	rattributeQuotes = new RegExp( "=" + whitespace + "*([^\\]'\"]*?)" + whitespace + "*\\]", "g" ),

	rpseudo = new RegExp( pseudos ),
	ridentifier = new RegExp( "^" + identifier + "$" ),

	matchExpr = {
		"ID": new RegExp( "^#(" + characterEncoding + ")" ),
		"CLASS": new RegExp( "^\\.(" + characterEncoding + ")" ),
		"TAG": new RegExp( "^(" + characterEncoding.replace( "w", "w*" ) + ")" ),
		"ATTR": new RegExp( "^" + attributes ),
		"PSEUDO": new RegExp( "^" + pseudos ),
		"CHILD": new RegExp( "^:(only|first|last|nth|nth-last)-(child|of-type)(?:\\(" + whitespace +
			"*(even|odd|(([+-]|)(\\d*)n|)" + whitespace + "*(?:([+-]|)" + whitespace +
			"*(\\d+)|))" + whitespace + "*\\)|)", "i" ),
		"bool": new RegExp( "^(?:" + booleans + ")$", "i" ),
		// For use in libraries implementing .is()
		// We use this for POS matching in `select`
		"needsContext": new RegExp( "^" + whitespace + "*[>+~]|:(even|odd|eq|gt|lt|nth|first|last)(?:\\(" +
			whitespace + "*((?:-\\d)?\\d*)" + whitespace + "*\\)|)(?=[^-]|$)", "i" )
	},

	rinputs = /^(?:input|select|textarea|button)$/i,
	rheader = /^h\d$/i,

	rnative = /^[^{]+\{\s*\[native \w/,

	// Easily-parseable/retrievable ID or TAG or CLASS selectors
	rquickExpr = /^(?:#([\w-]+)|(\w+)|\.([\w-]+))$/,

	rsibling = /[+~]/,
	rescape = /'|\\/g,

	// CSS escapes http://www.w3.org/TR/CSS21/syndata.html#escaped-characters
	runescape = new RegExp( "\\\\([\\da-f]{1,6}" + whitespace + "?|(" + whitespace + ")|.)", "ig" ),
	funescape = function( _, escaped, escapedWhitespace ) {
		var high = "0x" + escaped - 0x10000;
		// NaN means non-codepoint
		// Support: Firefox<24
		// Workaround erroneous numeric interpretation of +"0x"
		return high !== high || escapedWhitespace ?
			escaped :
			high < 0 ?
				// BMP codepoint
				String.fromCharCode( high + 0x10000 ) :
				// Supplemental Plane codepoint (surrogate pair)
				String.fromCharCode( high >> 10 | 0xD800, high & 0x3FF | 0xDC00 );
	};

// Optimize for push.apply( _, NodeList )
try {
	push.apply(
		(arr = slice.call( preferredDoc.childNodes )),
		preferredDoc.childNodes
	);
	// Support: Android<4.0
	// Detect silently failing push.apply
	arr[ preferredDoc.childNodes.length ].nodeType;
} catch ( e ) {
	push = { apply: arr.length ?

		// Leverage slice if possible
		function( target, els ) {
			push_native.apply( target, slice.call(els) );
		} :

		// Support: IE<9
		// Otherwise append directly
		function( target, els ) {
			var j = target.length,
				i = 0;
			// Can't trust NodeList.length
			while ( (target[j++] = els[i++]) ) {}
			target.length = j - 1;
		}
	};
}

function Sizzle( selector, context, results, seed ) {
	var match, elem, m, nodeType,
		// QSA vars
		i, groups, old, nid, newContext, newSelector;

	if ( ( context ? context.ownerDocument || context : preferredDoc ) !== document ) {
		setDocument( context );
	}

	context = context || document;
	results = results || [];

	if ( !selector || typeof selector !== "string" ) {
		return results;
	}

	if ( (nodeType = context.nodeType) !== 1 && nodeType !== 9 ) {
		return [];
	}

	if ( documentIsHTML && !seed ) {

		// Shortcuts
		if ( (match = rquickExpr.exec( selector )) ) {
			// Speed-up: Sizzle("#ID")
			if ( (m = match[1]) ) {
				if ( nodeType === 9 ) {
					elem = context.getElementById( m );
					// Check parentNode to catch when Blackberry 4.6 returns
					// nodes that are no longer in the document (jQuery #6963)
					if ( elem && elem.parentNode ) {
						// Handle the case where IE, Opera, and Webkit return items
						// by name instead of ID
						if ( elem.id === m ) {
							results.push( elem );
							return results;
						}
					} else {
						return results;
					}
				} else {
					// Context is not a document
					if ( context.ownerDocument && (elem = context.ownerDocument.getElementById( m )) &&
						contains( context, elem ) && elem.id === m ) {
						results.push( elem );
						return results;
					}
				}

			// Speed-up: Sizzle("TAG")
			} else if ( match[2] ) {
				push.apply( results, context.getElementsByTagName( selector ) );
				return results;

			// Speed-up: Sizzle(".CLASS")
			} else if ( (m = match[3]) && support.getElementsByClassName && context.getElementsByClassName ) {
				push.apply( results, context.getElementsByClassName( m ) );
				return results;
			}
		}

		// QSA path
		if ( support.qsa && (!rbuggyQSA || !rbuggyQSA.test( selector )) ) {
			nid = old = expando;
			newContext = context;
			newSelector = nodeType === 9 && selector;

			// qSA works strangely on Element-rooted queries
			// We can work around this by specifying an extra ID on the root
			// and working up from there (Thanks to Andrew Dupont for the technique)
			// IE 8 doesn't work on object elements
			if ( nodeType === 1 && context.nodeName.toLowerCase() !== "object" ) {
				groups = tokenize( selector );

				if ( (old = context.getAttribute("id")) ) {
					nid = old.replace( rescape, "\\$&" );
				} else {
					context.setAttribute( "id", nid );
				}
				nid = "[id='" + nid + "'] ";

				i = groups.length;
				while ( i-- ) {
					groups[i] = nid + toSelector( groups[i] );
				}
				newContext = rsibling.test( selector ) && testContext( context.parentNode ) || context;
				newSelector = groups.join(",");
			}

			if ( newSelector ) {
				try {
					push.apply( results,
						newContext.querySelectorAll( newSelector )
					);
					return results;
				} catch(qsaError) {
				} finally {
					if ( !old ) {
						context.removeAttribute("id");
					}
				}
			}
		}
	}

	// All others
	return select( selector.replace( rtrim, "$1" ), context, results, seed );
}

/**
 * Create key-value caches of limited size
 * @returns {Function(string, Object)} Returns the Object data after storing it on itself with
 *	property name the (space-suffixed) string and (if the cache is larger than Expr.cacheLength)
 *	deleting the oldest entry
 */
function createCache() {
	var keys = [];

	function cache( key, value ) {
		// Use (key + " ") to avoid collision with native prototype properties (see Issue #157)
		if ( keys.push( key + " " ) > Expr.cacheLength ) {
			// Only keep the most recent entries
			delete cache[ keys.shift() ];
		}
		return (cache[ key + " " ] = value);
	}
	return cache;
}

/**
 * Mark a function for special use by Sizzle
 * @param {Function} fn The function to mark
 */
function markFunction( fn ) {
	fn[ expando ] = true;
	return fn;
}

/**
 * Support testing using an element
 * @param {Function} fn Passed the created div and expects a boolean result
 */
function assert( fn ) {
	var div = document.createElement("div");

	try {
		return !!fn( div );
	} catch (e) {
		return false;
	} finally {
		// Remove from its parent by default
		if ( div.parentNode ) {
			div.parentNode.removeChild( div );
		}
		// release memory in IE
		div = null;
	}
}

/**
 * Adds the same handler for all of the specified attrs
 * @param {String} attrs Pipe-separated list of attributes
 * @param {Function} handler The method that will be applied
 */
function addHandle( attrs, handler ) {
	var arr = attrs.split("|"),
		i = attrs.length;

	while ( i-- ) {
		Expr.attrHandle[ arr[i] ] = handler;
	}
}

/**
 * Checks document order of two siblings
 * @param {Element} a
 * @param {Element} b
 * @returns {Number} Returns less than 0 if a precedes b, greater than 0 if a follows b
 */
function siblingCheck( a, b ) {
	var cur = b && a,
		diff = cur && a.nodeType === 1 && b.nodeType === 1 &&
			( ~b.sourceIndex || MAX_NEGATIVE ) -
			( ~a.sourceIndex || MAX_NEGATIVE );

	// Use IE sourceIndex if available on both nodes
	if ( diff ) {
		return diff;
	}

	// Check if b follows a
	if ( cur ) {
		while ( (cur = cur.nextSibling) ) {
			if ( cur === b ) {
				return -1;
			}
		}
	}

	return a ? 1 : -1;
}

/**
 * Returns a function to use in pseudos for input types
 * @param {String} type
 */
function createInputPseudo( type ) {
	return function( elem ) {
		var name = elem.nodeName.toLowerCase();
		return name === "input" && elem.type === type;
	};
}

/**
 * Returns a function to use in pseudos for buttons
 * @param {String} type
 */
function createButtonPseudo( type ) {
	return function( elem ) {
		var name = elem.nodeName.toLowerCase();
		return (name === "input" || name === "button") && elem.type === type;
	};
}

/**
 * Returns a function to use in pseudos for positionals
 * @param {Function} fn
 */
function createPositionalPseudo( fn ) {
	return markFunction(function( argument ) {
		argument = +argument;
		return markFunction(function( seed, matches ) {
			var j,
				matchIndexes = fn( [], seed.length, argument ),
				i = matchIndexes.length;

			// Match elements found at the specified indexes
			while ( i-- ) {
				if ( seed[ (j = matchIndexes[i]) ] ) {
					seed[j] = !(matches[j] = seed[j]);
				}
			}
		});
	});
}

/**
 * Checks a node for validity as a Sizzle context
 * @param {Element|Object=} context
 * @returns {Element|Object|Boolean} The input node if acceptable, otherwise a falsy value
 */
function testContext( context ) {
	return context && typeof context.getElementsByTagName !== strundefined && context;
}

// Expose support vars for convenience
support = Sizzle.support = {};

/**
 * Detects XML nodes
 * @param {Element|Object} elem An element or a document
 * @returns {Boolean} True iff elem is a non-HTML XML node
 */
isXML = Sizzle.isXML = function( elem ) {
	// documentElement is verified for cases where it doesn't yet exist
	// (such as loading iframes in IE - #4833)
	var documentElement = elem && (elem.ownerDocument || elem).documentElement;
	return documentElement ? documentElement.nodeName !== "HTML" : false;
};

/**
 * Sets document-related variables once based on the current document
 * @param {Element|Object} [doc] An element or document object to use to set the document
 * @returns {Object} Returns the current document
 */
setDocument = Sizzle.setDocument = function( node ) {
	var hasCompare,
		doc = node ? node.ownerDocument || node : preferredDoc,
		parent = doc.defaultView;

	// If no document and documentElement is available, return
	if ( doc === document || doc.nodeType !== 9 || !doc.documentElement ) {
		return document;
	}

	// Set our document
	document = doc;
	docElem = doc.documentElement;

	// Support tests
	documentIsHTML = !isXML( doc );

	// Support: IE>8
	// If iframe document is assigned to "document" variable and if iframe has been reloaded,
	// IE will throw "permission denied" error when accessing "document" variable, see jQuery #13936
	// IE6-8 do not support the defaultView property so parent will be undefined
	if ( parent && parent !== parent.top ) {
		// IE11 does not have attachEvent, so all must suffer
		if ( parent.addEventListener ) {
			parent.addEventListener( "unload", function() {
				setDocument();
			}, false );
		} else if ( parent.attachEvent ) {
			parent.attachEvent( "onunload", function() {
				setDocument();
			});
		}
	}

	/* Attributes
	---------------------------------------------------------------------- */

	// Support: IE<8
	// Verify that getAttribute really returns attributes and not properties (excepting IE8 booleans)
	support.attributes = assert(function( div ) {
		div.className = "i";
		return !div.getAttribute("className");
	});

	/* getElement(s)By*
	---------------------------------------------------------------------- */

	// Check if getElementsByTagName("*") returns only elements
	support.getElementsByTagName = assert(function( div ) {
		div.appendChild( doc.createComment("") );
		return !div.getElementsByTagName("*").length;
	});

	// Check if getElementsByClassName can be trusted
	support.getElementsByClassName = rnative.test( doc.getElementsByClassName ) && assert(function( div ) {
		div.innerHTML = "<div class='a'></div><div class='a i'></div>";

		// Support: Safari<4
		// Catch class over-caching
		div.firstChild.className = "i";
		// Support: Opera<10
		// Catch gEBCN failure to find non-leading classes
		return div.getElementsByClassName("i").length === 2;
	});

	// Support: IE<10
	// Check if getElementById returns elements by name
	// The broken getElementById methods don't pick up programatically-set names,
	// so use a roundabout getElementsByName test
	support.getById = assert(function( div ) {
		docElem.appendChild( div ).id = expando;
		return !doc.getElementsByName || !doc.getElementsByName( expando ).length;
	});

	// ID find and filter
	if ( support.getById ) {
		Expr.find["ID"] = function( id, context ) {
			if ( typeof context.getElementById !== strundefined && documentIsHTML ) {
				var m = context.getElementById( id );
				// Check parentNode to catch when Blackberry 4.6 returns
				// nodes that are no longer in the document #6963
				return m && m.parentNode ? [ m ] : [];
			}
		};
		Expr.filter["ID"] = function( id ) {
			var attrId = id.replace( runescape, funescape );
			return function( elem ) {
				return elem.getAttribute("id") === attrId;
			};
		};
	} else {
		// Support: IE6/7
		// getElementById is not reliable as a find shortcut
		delete Expr.find["ID"];

		Expr.filter["ID"] =  function( id ) {
			var attrId = id.replace( runescape, funescape );
			return function( elem ) {
				var node = typeof elem.getAttributeNode !== strundefined && elem.getAttributeNode("id");
				return node && node.value === attrId;
			};
		};
	}

	// Tag
	Expr.find["TAG"] = support.getElementsByTagName ?
		function( tag, context ) {
			if ( typeof context.getElementsByTagName !== strundefined ) {
				return context.getElementsByTagName( tag );
			}
		} :
		function( tag, context ) {
			var elem,
				tmp = [],
				i = 0,
				results = context.getElementsByTagName( tag );

			// Filter out possible comments
			if ( tag === "*" ) {
				while ( (elem = results[i++]) ) {
					if ( elem.nodeType === 1 ) {
						tmp.push( elem );
					}
				}

				return tmp;
			}
			return results;
		};

	// Class
	Expr.find["CLASS"] = support.getElementsByClassName && function( className, context ) {
		if ( typeof context.getElementsByClassName !== strundefined && documentIsHTML ) {
			return context.getElementsByClassName( className );
		}
	};

	/* QSA/matchesSelector
	---------------------------------------------------------------------- */

	// QSA and matchesSelector support

	// matchesSelector(:active) reports false when true (IE9/Opera 11.5)
	rbuggyMatches = [];

	// qSa(:focus) reports false when true (Chrome 21)
	// We allow this because of a bug in IE8/9 that throws an error
	// whenever `document.activeElement` is accessed on an iframe
	// So, we allow :focus to pass through QSA all the time to avoid the IE error
	// See http://bugs.jquery.com/ticket/13378
	rbuggyQSA = [];

	if ( (support.qsa = rnative.test( doc.querySelectorAll )) ) {
		// Build QSA regex
		// Regex strategy adopted from Diego Perini
		assert(function( div ) {
			// Select is set to empty string on purpose
			// This is to test IE's treatment of not explicitly
			// setting a boolean content attribute,
			// since its presence should be enough
			// http://bugs.jquery.com/ticket/12359
			div.innerHTML = "<select msallowclip=''><option selected=''></option></select>";

			// Support: IE8, Opera 11-12.16
			// Nothing should be selected when empty strings follow ^= or $= or *=
			// The test attribute must be unknown in Opera but "safe" for WinRT
			// http://msdn.microsoft.com/en-us/library/ie/hh465388.aspx#attribute_section
			if ( div.querySelectorAll("[msallowclip^='']").length ) {
				rbuggyQSA.push( "[*^$]=" + whitespace + "*(?:''|\"\")" );
			}

			// Support: IE8
			// Boolean attributes and "value" are not treated correctly
			if ( !div.querySelectorAll("[selected]").length ) {
				rbuggyQSA.push( "\\[" + whitespace + "*(?:value|" + booleans + ")" );
			}

			// Webkit/Opera - :checked should return selected option elements
			// http://www.w3.org/TR/2011/REC-css3-selectors-20110929/#checked
			// IE8 throws error here and will not see later tests
			if ( !div.querySelectorAll(":checked").length ) {
				rbuggyQSA.push(":checked");
			}
		});

		assert(function( div ) {
			// Support: Windows 8 Native Apps
			// The type and name attributes are restricted during .innerHTML assignment
			var input = doc.createElement("input");
			input.setAttribute( "type", "hidden" );
			div.appendChild( input ).setAttribute( "name", "D" );

			// Support: IE8
			// Enforce case-sensitivity of name attribute
			if ( div.querySelectorAll("[name=d]").length ) {
				rbuggyQSA.push( "name" + whitespace + "*[*^$|!~]?=" );
			}

			// FF 3.5 - :enabled/:disabled and hidden elements (hidden elements are still enabled)
			// IE8 throws error here and will not see later tests
			if ( !div.querySelectorAll(":enabled").length ) {
				rbuggyQSA.push( ":enabled", ":disabled" );
			}

			// Opera 10-11 does not throw on post-comma invalid pseudos
			div.querySelectorAll("*,:x");
			rbuggyQSA.push(",.*:");
		});
	}

	if ( (support.matchesSelector = rnative.test( (matches = docElem.matches ||
		docElem.webkitMatchesSelector ||
		docElem.mozMatchesSelector ||
		docElem.oMatchesSelector ||
		docElem.msMatchesSelector) )) ) {

		assert(function( div ) {
			// Check to see if it's possible to do matchesSelector
			// on a disconnected node (IE 9)
			support.disconnectedMatch = matches.call( div, "div" );

			// This should fail with an exception
			// Gecko does not error, returns false instead
			matches.call( div, "[s!='']:x" );
			rbuggyMatches.push( "!=", pseudos );
		});
	}

	rbuggyQSA = rbuggyQSA.length && new RegExp( rbuggyQSA.join("|") );
	rbuggyMatches = rbuggyMatches.length && new RegExp( rbuggyMatches.join("|") );

	/* Contains
	---------------------------------------------------------------------- */
	hasCompare = rnative.test( docElem.compareDocumentPosition );

	// Element contains another
	// Purposefully does not implement inclusive descendent
	// As in, an element does not contain itself
	contains = hasCompare || rnative.test( docElem.contains ) ?
		function( a, b ) {
			var adown = a.nodeType === 9 ? a.documentElement : a,
				bup = b && b.parentNode;
			return a === bup || !!( bup && bup.nodeType === 1 && (
				adown.contains ?
					adown.contains( bup ) :
					a.compareDocumentPosition && a.compareDocumentPosition( bup ) & 16
			));
		} :
		function( a, b ) {
			if ( b ) {
				while ( (b = b.parentNode) ) {
					if ( b === a ) {
						return true;
					}
				}
			}
			return false;
		};

	/* Sorting
	---------------------------------------------------------------------- */

	// Document order sorting
	sortOrder = hasCompare ?
	function( a, b ) {

		// Flag for duplicate removal
		if ( a === b ) {
			hasDuplicate = true;
			return 0;
		}

		// Sort on method existence if only one input has compareDocumentPosition
		var compare = !a.compareDocumentPosition - !b.compareDocumentPosition;
		if ( compare ) {
			return compare;
		}

		// Calculate position if both inputs belong to the same document
		compare = ( a.ownerDocument || a ) === ( b.ownerDocument || b ) ?
			a.compareDocumentPosition( b ) :

			// Otherwise we know they are disconnected
			1;

		// Disconnected nodes
		if ( compare & 1 ||
			(!support.sortDetached && b.compareDocumentPosition( a ) === compare) ) {

			// Choose the first element that is related to our preferred document
			if ( a === doc || a.ownerDocument === preferredDoc && contains(preferredDoc, a) ) {
				return -1;
			}
			if ( b === doc || b.ownerDocument === preferredDoc && contains(preferredDoc, b) ) {
				return 1;
			}

			// Maintain original order
			return sortInput ?
				( indexOf.call( sortInput, a ) - indexOf.call( sortInput, b ) ) :
				0;
		}

		return compare & 4 ? -1 : 1;
	} :
	function( a, b ) {
		// Exit early if the nodes are identical
		if ( a === b ) {
			hasDuplicate = true;
			return 0;
		}

		var cur,
			i = 0,
			aup = a.parentNode,
			bup = b.parentNode,
			ap = [ a ],
			bp = [ b ];

		// Parentless nodes are either documents or disconnected
		if ( !aup || !bup ) {
			return a === doc ? -1 :
				b === doc ? 1 :
				aup ? -1 :
				bup ? 1 :
				sortInput ?
				( indexOf.call( sortInput, a ) - indexOf.call( sortInput, b ) ) :
				0;

		// If the nodes are siblings, we can do a quick check
		} else if ( aup === bup ) {
			return siblingCheck( a, b );
		}

		// Otherwise we need full lists of their ancestors for comparison
		cur = a;
		while ( (cur = cur.parentNode) ) {
			ap.unshift( cur );
		}
		cur = b;
		while ( (cur = cur.parentNode) ) {
			bp.unshift( cur );
		}

		// Walk down the tree looking for a discrepancy
		while ( ap[i] === bp[i] ) {
			i++;
		}

		return i ?
			// Do a sibling check if the nodes have a common ancestor
			siblingCheck( ap[i], bp[i] ) :

			// Otherwise nodes in our document sort first
			ap[i] === preferredDoc ? -1 :
			bp[i] === preferredDoc ? 1 :
			0;
	};

	return doc;
};

Sizzle.matches = function( expr, elements ) {
	return Sizzle( expr, null, null, elements );
};

Sizzle.matchesSelector = function( elem, expr ) {
	// Set document vars if needed
	if ( ( elem.ownerDocument || elem ) !== document ) {
		setDocument( elem );
	}

	// Make sure that attribute selectors are quoted
	expr = expr.replace( rattributeQuotes, "='$1']" );

	if ( support.matchesSelector && documentIsHTML &&
		( !rbuggyMatches || !rbuggyMatches.test( expr ) ) &&
		( !rbuggyQSA     || !rbuggyQSA.test( expr ) ) ) {

		try {
			var ret = matches.call( elem, expr );

			// IE 9's matchesSelector returns false on disconnected nodes
			if ( ret || support.disconnectedMatch ||
					// As well, disconnected nodes are said to be in a document
					// fragment in IE 9
					elem.document && elem.document.nodeType !== 11 ) {
				return ret;
			}
		} catch(e) {}
	}

	return Sizzle( expr, document, null, [ elem ] ).length > 0;
};

Sizzle.contains = function( context, elem ) {
	// Set document vars if needed
	if ( ( context.ownerDocument || context ) !== document ) {
		setDocument( context );
	}
	return contains( context, elem );
};

Sizzle.attr = function( elem, name ) {
	// Set document vars if needed
	if ( ( elem.ownerDocument || elem ) !== document ) {
		setDocument( elem );
	}

	var fn = Expr.attrHandle[ name.toLowerCase() ],
		// Don't get fooled by Object.prototype properties (jQuery #13807)
		val = fn && hasOwn.call( Expr.attrHandle, name.toLowerCase() ) ?
			fn( elem, name, !documentIsHTML ) :
			undefined;

	return val !== undefined ?
		val :
		support.attributes || !documentIsHTML ?
			elem.getAttribute( name ) :
			(val = elem.getAttributeNode(name)) && val.specified ?
				val.value :
				null;
};

Sizzle.error = function( msg ) {
	throw new Error( "Syntax error, unrecognized expression: " + msg );
};

/**
 * Document sorting and removing duplicates
 * @param {ArrayLike} results
 */
Sizzle.uniqueSort = function( results ) {
	var elem,
		duplicates = [],
		j = 0,
		i = 0;

	// Unless we *know* we can detect duplicates, assume their presence
	hasDuplicate = !support.detectDuplicates;
	sortInput = !support.sortStable && results.slice( 0 );
	results.sort( sortOrder );

	if ( hasDuplicate ) {
		while ( (elem = results[i++]) ) {
			if ( elem === results[ i ] ) {
				j = duplicates.push( i );
			}
		}
		while ( j-- ) {
			results.splice( duplicates[ j ], 1 );
		}
	}

	// Clear input after sorting to release objects
	// See https://github.com/jquery/sizzle/pull/225
	sortInput = null;

	return results;
};

/**
 * Utility function for retrieving the text value of an array of DOM nodes
 * @param {Array|Element} elem
 */
getText = Sizzle.getText = function( elem ) {
	var node,
		ret = "",
		i = 0,
		nodeType = elem.nodeType;

	if ( !nodeType ) {
		// If no nodeType, this is expected to be an array
		while ( (node = elem[i++]) ) {
			// Do not traverse comment nodes
			ret += getText( node );
		}
	} else if ( nodeType === 1 || nodeType === 9 || nodeType === 11 ) {
		// Use textContent for elements
		// innerText usage removed for consistency of new lines (jQuery #11153)
		if ( typeof elem.textContent === "string" ) {
			return elem.textContent;
		} else {
			// Traverse its children
			for ( elem = elem.firstChild; elem; elem = elem.nextSibling ) {
				ret += getText( elem );
			}
		}
	} else if ( nodeType === 3 || nodeType === 4 ) {
		return elem.nodeValue;
	}
	// Do not include comment or processing instruction nodes

	return ret;
};

Expr = Sizzle.selectors = {

	// Can be adjusted by the user
	cacheLength: 50,

	createPseudo: markFunction,

	match: matchExpr,

	attrHandle: {},

	find: {},

	relative: {
		">": { dir: "parentNode", first: true },
		" ": { dir: "parentNode" },
		"+": { dir: "previousSibling", first: true },
		"~": { dir: "previousSibling" }
	},

	preFilter: {
		"ATTR": function( match ) {
			match[1] = match[1].replace( runescape, funescape );

			// Move the given value to match[3] whether quoted or unquoted
			match[3] = ( match[3] || match[4] || match[5] || "" ).replace( runescape, funescape );

			if ( match[2] === "~=" ) {
				match[3] = " " + match[3] + " ";
			}

			return match.slice( 0, 4 );
		},

		"CHILD": function( match ) {
			/* matches from matchExpr["CHILD"]
				1 type (only|nth|...)
				2 what (child|of-type)
				3 argument (even|odd|\d*|\d*n([+-]\d+)?|...)
				4 xn-component of xn+y argument ([+-]?\d*n|)
				5 sign of xn-component
				6 x of xn-component
				7 sign of y-component
				8 y of y-component
			*/
			match[1] = match[1].toLowerCase();

			if ( match[1].slice( 0, 3 ) === "nth" ) {
				// nth-* requires argument
				if ( !match[3] ) {
					Sizzle.error( match[0] );
				}

				// numeric x and y parameters for Expr.filter.CHILD
				// remember that false/true cast respectively to 0/1
				match[4] = +( match[4] ? match[5] + (match[6] || 1) : 2 * ( match[3] === "even" || match[3] === "odd" ) );
				match[5] = +( ( match[7] + match[8] ) || match[3] === "odd" );

			// other types prohibit arguments
			} else if ( match[3] ) {
				Sizzle.error( match[0] );
			}

			return match;
		},

		"PSEUDO": function( match ) {
			var excess,
				unquoted = !match[6] && match[2];

			if ( matchExpr["CHILD"].test( match[0] ) ) {
				return null;
			}

			// Accept quoted arguments as-is
			if ( match[3] ) {
				match[2] = match[4] || match[5] || "";

			// Strip excess characters from unquoted arguments
			} else if ( unquoted && rpseudo.test( unquoted ) &&
				// Get excess from tokenize (recursively)
				(excess = tokenize( unquoted, true )) &&
				// advance to the next closing parenthesis
				(excess = unquoted.indexOf( ")", unquoted.length - excess ) - unquoted.length) ) {

				// excess is a negative index
				match[0] = match[0].slice( 0, excess );
				match[2] = unquoted.slice( 0, excess );
			}

			// Return only captures needed by the pseudo filter method (type and argument)
			return match.slice( 0, 3 );
		}
	},

	filter: {

		"TAG": function( nodeNameSelector ) {
			var nodeName = nodeNameSelector.replace( runescape, funescape ).toLowerCase();
			return nodeNameSelector === "*" ?
				function() { return true; } :
				function( elem ) {
					return elem.nodeName && elem.nodeName.toLowerCase() === nodeName;
				};
		},

		"CLASS": function( className ) {
			var pattern = classCache[ className + " " ];

			return pattern ||
				(pattern = new RegExp( "(^|" + whitespace + ")" + className + "(" + whitespace + "|$)" )) &&
				classCache( className, function( elem ) {
					return pattern.test( typeof elem.className === "string" && elem.className || typeof elem.getAttribute !== strundefined && elem.getAttribute("class") || "" );
				});
		},

		"ATTR": function( name, operator, check ) {
			return function( elem ) {
				var result = Sizzle.attr( elem, name );

				if ( result == null ) {
					return operator === "!=";
				}
				if ( !operator ) {
					return true;
				}

				result += "";

				return operator === "=" ? result === check :
					operator === "!=" ? result !== check :
					operator === "^=" ? check && result.indexOf( check ) === 0 :
					operator === "*=" ? check && result.indexOf( check ) > -1 :
					operator === "$=" ? check && result.slice( -check.length ) === check :
					operator === "~=" ? ( " " + result + " " ).indexOf( check ) > -1 :
					operator === "|=" ? result === check || result.slice( 0, check.length + 1 ) === check + "-" :
					false;
			};
		},

		"CHILD": function( type, what, argument, first, last ) {
			var simple = type.slice( 0, 3 ) !== "nth",
				forward = type.slice( -4 ) !== "last",
				ofType = what === "of-type";

			return first === 1 && last === 0 ?

				// Shortcut for :nth-*(n)
				function( elem ) {
					return !!elem.parentNode;
				} :

				function( elem, context, xml ) {
					var cache, outerCache, node, diff, nodeIndex, start,
						dir = simple !== forward ? "nextSibling" : "previousSibling",
						parent = elem.parentNode,
						name = ofType && elem.nodeName.toLowerCase(),
						useCache = !xml && !ofType;

					if ( parent ) {

						// :(first|last|only)-(child|of-type)
						if ( simple ) {
							while ( dir ) {
								node = elem;
								while ( (node = node[ dir ]) ) {
									if ( ofType ? node.nodeName.toLowerCase() === name : node.nodeType === 1 ) {
										return false;
									}
								}
								// Reverse direction for :only-* (if we haven't yet done so)
								start = dir = type === "only" && !start && "nextSibling";
							}
							return true;
						}

						start = [ forward ? parent.firstChild : parent.lastChild ];

						// non-xml :nth-child(...) stores cache data on `parent`
						if ( forward && useCache ) {
							// Seek `elem` from a previously-cached index
							outerCache = parent[ expando ] || (parent[ expando ] = {});
							cache = outerCache[ type ] || [];
							nodeIndex = cache[0] === dirruns && cache[1];
							diff = cache[0] === dirruns && cache[2];
							node = nodeIndex && parent.childNodes[ nodeIndex ];

							while ( (node = ++nodeIndex && node && node[ dir ] ||

								// Fallback to seeking `elem` from the start
								(diff = nodeIndex = 0) || start.pop()) ) {

								// When found, cache indexes on `parent` and break
								if ( node.nodeType === 1 && ++diff && node === elem ) {
									outerCache[ type ] = [ dirruns, nodeIndex, diff ];
									break;
								}
							}

						// Use previously-cached element index if available
						} else if ( useCache && (cache = (elem[ expando ] || (elem[ expando ] = {}))[ type ]) && cache[0] === dirruns ) {
							diff = cache[1];

						// xml :nth-child(...) or :nth-last-child(...) or :nth(-last)?-of-type(...)
						} else {
							// Use the same loop as above to seek `elem` from the start
							while ( (node = ++nodeIndex && node && node[ dir ] ||
								(diff = nodeIndex = 0) || start.pop()) ) {

								if ( ( ofType ? node.nodeName.toLowerCase() === name : node.nodeType === 1 ) && ++diff ) {
									// Cache the index of each encountered element
									if ( useCache ) {
										(node[ expando ] || (node[ expando ] = {}))[ type ] = [ dirruns, diff ];
									}

									if ( node === elem ) {
										break;
									}
								}
							}
						}

						// Incorporate the offset, then check against cycle size
						diff -= last;
						return diff === first || ( diff % first === 0 && diff / first >= 0 );
					}
				};
		},

		"PSEUDO": function( pseudo, argument ) {
			// pseudo-class names are case-insensitive
			// http://www.w3.org/TR/selectors/#pseudo-classes
			// Prioritize by case sensitivity in case custom pseudos are added with uppercase letters
			// Remember that setFilters inherits from pseudos
			var args,
				fn = Expr.pseudos[ pseudo ] || Expr.setFilters[ pseudo.toLowerCase() ] ||
					Sizzle.error( "unsupported pseudo: " + pseudo );

			// The user may use createPseudo to indicate that
			// arguments are needed to create the filter function
			// just as Sizzle does
			if ( fn[ expando ] ) {
				return fn( argument );
			}

			// But maintain support for old signatures
			if ( fn.length > 1 ) {
				args = [ pseudo, pseudo, "", argument ];
				return Expr.setFilters.hasOwnProperty( pseudo.toLowerCase() ) ?
					markFunction(function( seed, matches ) {
						var idx,
							matched = fn( seed, argument ),
							i = matched.length;
						while ( i-- ) {
							idx = indexOf.call( seed, matched[i] );
							seed[ idx ] = !( matches[ idx ] = matched[i] );
						}
					}) :
					function( elem ) {
						return fn( elem, 0, args );
					};
			}

			return fn;
		}
	},

	pseudos: {
		// Potentially complex pseudos
		"not": markFunction(function( selector ) {
			// Trim the selector passed to compile
			// to avoid treating leading and trailing
			// spaces as combinators
			var input = [],
				results = [],
				matcher = compile( selector.replace( rtrim, "$1" ) );

			return matcher[ expando ] ?
				markFunction(function( seed, matches, context, xml ) {
					var elem,
						unmatched = matcher( seed, null, xml, [] ),
						i = seed.length;

					// Match elements unmatched by `matcher`
					while ( i-- ) {
						if ( (elem = unmatched[i]) ) {
							seed[i] = !(matches[i] = elem);
						}
					}
				}) :
				function( elem, context, xml ) {
					input[0] = elem;
					matcher( input, null, xml, results );
					return !results.pop();
				};
		}),

		"has": markFunction(function( selector ) {
			return function( elem ) {
				return Sizzle( selector, elem ).length > 0;
			};
		}),

		"contains": markFunction(function( text ) {
			return function( elem ) {
				return ( elem.textContent || elem.innerText || getText( elem ) ).indexOf( text ) > -1;
			};
		}),

		// "Whether an element is represented by a :lang() selector
		// is based solely on the element's language value
		// being equal to the identifier C,
		// or beginning with the identifier C immediately followed by "-".
		// The matching of C against the element's language value is performed case-insensitively.
		// The identifier C does not have to be a valid language name."
		// http://www.w3.org/TR/selectors/#lang-pseudo
		"lang": markFunction( function( lang ) {
			// lang value must be a valid identifier
			if ( !ridentifier.test(lang || "") ) {
				Sizzle.error( "unsupported lang: " + lang );
			}
			lang = lang.replace( runescape, funescape ).toLowerCase();
			return function( elem ) {
				var elemLang;
				do {
					if ( (elemLang = documentIsHTML ?
						elem.lang :
						elem.getAttribute("xml:lang") || elem.getAttribute("lang")) ) {

						elemLang = elemLang.toLowerCase();
						return elemLang === lang || elemLang.indexOf( lang + "-" ) === 0;
					}
				} while ( (elem = elem.parentNode) && elem.nodeType === 1 );
				return false;
			};
		}),

		// Miscellaneous
		"target": function( elem ) {
			var hash = window.location && window.location.hash;
			return hash && hash.slice( 1 ) === elem.id;
		},

		"root": function( elem ) {
			return elem === docElem;
		},

		"focus": function( elem ) {
			return elem === document.activeElement && (!document.hasFocus || document.hasFocus()) && !!(elem.type || elem.href || ~elem.tabIndex);
		},

		// Boolean properties
		"enabled": function( elem ) {
			return elem.disabled === false;
		},

		"disabled": function( elem ) {
			return elem.disabled === true;
		},

		"checked": function( elem ) {
			// In CSS3, :checked should return both checked and selected elements
			// http://www.w3.org/TR/2011/REC-css3-selectors-20110929/#checked
			var nodeName = elem.nodeName.toLowerCase();
			return (nodeName === "input" && !!elem.checked) || (nodeName === "option" && !!elem.selected);
		},

		"selected": function( elem ) {
			// Accessing this property makes selected-by-default
			// options in Safari work properly
			if ( elem.parentNode ) {
				elem.parentNode.selectedIndex;
			}

			return elem.selected === true;
		},

		// Contents
		"empty": function( elem ) {
			// http://www.w3.org/TR/selectors/#empty-pseudo
			// :empty is negated by element (1) or content nodes (text: 3; cdata: 4; entity ref: 5),
			//   but not by others (comment: 8; processing instruction: 7; etc.)
			// nodeType < 6 works because attributes (2) do not appear as children
			for ( elem = elem.firstChild; elem; elem = elem.nextSibling ) {
				if ( elem.nodeType < 6 ) {
					return false;
				}
			}
			return true;
		},

		"parent": function( elem ) {
			return !Expr.pseudos["empty"]( elem );
		},

		// Element/input types
		"header": function( elem ) {
			return rheader.test( elem.nodeName );
		},

		"input": function( elem ) {
			return rinputs.test( elem.nodeName );
		},

		"button": function( elem ) {
			var name = elem.nodeName.toLowerCase();
			return name === "input" && elem.type === "button" || name === "button";
		},

		"text": function( elem ) {
			var attr;
			return elem.nodeName.toLowerCase() === "input" &&
				elem.type === "text" &&

				// Support: IE<8
				// New HTML5 attribute values (e.g., "search") appear with elem.type === "text"
				( (attr = elem.getAttribute("type")) == null || attr.toLowerCase() === "text" );
		},

		// Position-in-collection
		"first": createPositionalPseudo(function() {
			return [ 0 ];
		}),

		"last": createPositionalPseudo(function( matchIndexes, length ) {
			return [ length - 1 ];
		}),

		"eq": createPositionalPseudo(function( matchIndexes, length, argument ) {
			return [ argument < 0 ? argument + length : argument ];
		}),

		"even": createPositionalPseudo(function( matchIndexes, length ) {
			var i = 0;
			for ( ; i < length; i += 2 ) {
				matchIndexes.push( i );
			}
			return matchIndexes;
		}),

		"odd": createPositionalPseudo(function( matchIndexes, length ) {
			var i = 1;
			for ( ; i < length; i += 2 ) {
				matchIndexes.push( i );
			}
			return matchIndexes;
		}),

		"lt": createPositionalPseudo(function( matchIndexes, length, argument ) {
			var i = argument < 0 ? argument + length : argument;
			for ( ; --i >= 0; ) {
				matchIndexes.push( i );
			}
			return matchIndexes;
		}),

		"gt": createPositionalPseudo(function( matchIndexes, length, argument ) {
			var i = argument < 0 ? argument + length : argument;
			for ( ; ++i < length; ) {
				matchIndexes.push( i );
			}
			return matchIndexes;
		})
	}
};

Expr.pseudos["nth"] = Expr.pseudos["eq"];

// Add button/input type pseudos
for ( i in { radio: true, checkbox: true, file: true, password: true, image: true } ) {
	Expr.pseudos[ i ] = createInputPseudo( i );
}
for ( i in { submit: true, reset: true } ) {
	Expr.pseudos[ i ] = createButtonPseudo( i );
}

// Easy API for creating new setFilters
function setFilters() {}
setFilters.prototype = Expr.filters = Expr.pseudos;
Expr.setFilters = new setFilters();

tokenize = Sizzle.tokenize = function( selector, parseOnly ) {
	var matched, match, tokens, type,
		soFar, groups, preFilters,
		cached = tokenCache[ selector + " " ];

	if ( cached ) {
		return parseOnly ? 0 : cached.slice( 0 );
	}

	soFar = selector;
	groups = [];
	preFilters = Expr.preFilter;

	while ( soFar ) {

		// Comma and first run
		if ( !matched || (match = rcomma.exec( soFar )) ) {
			if ( match ) {
				// Don't consume trailing commas as valid
				soFar = soFar.slice( match[0].length ) || soFar;
			}
			groups.push( (tokens = []) );
		}

		matched = false;

		// Combinators
		if ( (match = rcombinators.exec( soFar )) ) {
			matched = match.shift();
			tokens.push({
				value: matched,
				// Cast descendant combinators to space
				type: match[0].replace( rtrim, " " )
			});
			soFar = soFar.slice( matched.length );
		}

		// Filters
		for ( type in Expr.filter ) {
			if ( (match = matchExpr[ type ].exec( soFar )) && (!preFilters[ type ] ||
				(match = preFilters[ type ]( match ))) ) {
				matched = match.shift();
				tokens.push({
					value: matched,
					type: type,
					matches: match
				});
				soFar = soFar.slice( matched.length );
			}
		}

		if ( !matched ) {
			break;
		}
	}

	// Return the length of the invalid excess
	// if we're just parsing
	// Otherwise, throw an error or return tokens
	return parseOnly ?
		soFar.length :
		soFar ?
			Sizzle.error( selector ) :
			// Cache the tokens
			tokenCache( selector, groups ).slice( 0 );
};

function toSelector( tokens ) {
	var i = 0,
		len = tokens.length,
		selector = "";
	for ( ; i < len; i++ ) {
		selector += tokens[i].value;
	}
	return selector;
}

function addCombinator( matcher, combinator, base ) {
	var dir = combinator.dir,
		checkNonElements = base && dir === "parentNode",
		doneName = done++;

	return combinator.first ?
		// Check against closest ancestor/preceding element
		function( elem, context, xml ) {
			while ( (elem = elem[ dir ]) ) {
				if ( elem.nodeType === 1 || checkNonElements ) {
					return matcher( elem, context, xml );
				}
			}
		} :

		// Check against all ancestor/preceding elements
		function( elem, context, xml ) {
			var oldCache, outerCache,
				newCache = [ dirruns, doneName ];

			// We can't set arbitrary data on XML nodes, so they don't benefit from dir caching
			if ( xml ) {
				while ( (elem = elem[ dir ]) ) {
					if ( elem.nodeType === 1 || checkNonElements ) {
						if ( matcher( elem, context, xml ) ) {
							return true;
						}
					}
				}
			} else {
				while ( (elem = elem[ dir ]) ) {
					if ( elem.nodeType === 1 || checkNonElements ) {
						outerCache = elem[ expando ] || (elem[ expando ] = {});
						if ( (oldCache = outerCache[ dir ]) &&
							oldCache[ 0 ] === dirruns && oldCache[ 1 ] === doneName ) {

							// Assign to newCache so results back-propagate to previous elements
							return (newCache[ 2 ] = oldCache[ 2 ]);
						} else {
							// Reuse newcache so results back-propagate to previous elements
							outerCache[ dir ] = newCache;

							// A match means we're done; a fail means we have to keep checking
							if ( (newCache[ 2 ] = matcher( elem, context, xml )) ) {
								return true;
							}
						}
					}
				}
			}
		};
}

function elementMatcher( matchers ) {
	return matchers.length > 1 ?
		function( elem, context, xml ) {
			var i = matchers.length;
			while ( i-- ) {
				if ( !matchers[i]( elem, context, xml ) ) {
					return false;
				}
			}
			return true;
		} :
		matchers[0];
}

function multipleContexts( selector, contexts, results ) {
	var i = 0,
		len = contexts.length;
	for ( ; i < len; i++ ) {
		Sizzle( selector, contexts[i], results );
	}
	return results;
}

function condense( unmatched, map, filter, context, xml ) {
	var elem,
		newUnmatched = [],
		i = 0,
		len = unmatched.length,
		mapped = map != null;

	for ( ; i < len; i++ ) {
		if ( (elem = unmatched[i]) ) {
			if ( !filter || filter( elem, context, xml ) ) {
				newUnmatched.push( elem );
				if ( mapped ) {
					map.push( i );
				}
			}
		}
	}

	return newUnmatched;
}

function setMatcher( preFilter, selector, matcher, postFilter, postFinder, postSelector ) {
	if ( postFilter && !postFilter[ expando ] ) {
		postFilter = setMatcher( postFilter );
	}
	if ( postFinder && !postFinder[ expando ] ) {
		postFinder = setMatcher( postFinder, postSelector );
	}
	return markFunction(function( seed, results, context, xml ) {
		var temp, i, elem,
			preMap = [],
			postMap = [],
			preexisting = results.length,

			// Get initial elements from seed or context
			elems = seed || multipleContexts( selector || "*", context.nodeType ? [ context ] : context, [] ),

			// Prefilter to get matcher input, preserving a map for seed-results synchronization
			matcherIn = preFilter && ( seed || !selector ) ?
				condense( elems, preMap, preFilter, context, xml ) :
				elems,

			matcherOut = matcher ?
				// If we have a postFinder, or filtered seed, or non-seed postFilter or preexisting results,
				postFinder || ( seed ? preFilter : preexisting || postFilter ) ?

					// ...intermediate processing is necessary
					[] :

					// ...otherwise use results directly
					results :
				matcherIn;

		// Find primary matches
		if ( matcher ) {
			matcher( matcherIn, matcherOut, context, xml );
		}

		// Apply postFilter
		if ( postFilter ) {
			temp = condense( matcherOut, postMap );
			postFilter( temp, [], context, xml );

			// Un-match failing elements by moving them back to matcherIn
			i = temp.length;
			while ( i-- ) {
				if ( (elem = temp[i]) ) {
					matcherOut[ postMap[i] ] = !(matcherIn[ postMap[i] ] = elem);
				}
			}
		}

		if ( seed ) {
			if ( postFinder || preFilter ) {
				if ( postFinder ) {
					// Get the final matcherOut by condensing this intermediate into postFinder contexts
					temp = [];
					i = matcherOut.length;
					while ( i-- ) {
						if ( (elem = matcherOut[i]) ) {
							// Restore matcherIn since elem is not yet a final match
							temp.push( (matcherIn[i] = elem) );
						}
					}
					postFinder( null, (matcherOut = []), temp, xml );
				}

				// Move matched elements from seed to results to keep them synchronized
				i = matcherOut.length;
				while ( i-- ) {
					if ( (elem = matcherOut[i]) &&
						(temp = postFinder ? indexOf.call( seed, elem ) : preMap[i]) > -1 ) {

						seed[temp] = !(results[temp] = elem);
					}
				}
			}

		// Add elements to results, through postFinder if defined
		} else {
			matcherOut = condense(
				matcherOut === results ?
					matcherOut.splice( preexisting, matcherOut.length ) :
					matcherOut
			);
			if ( postFinder ) {
				postFinder( null, results, matcherOut, xml );
			} else {
				push.apply( results, matcherOut );
			}
		}
	});
}

function matcherFromTokens( tokens ) {
	var checkContext, matcher, j,
		len = tokens.length,
		leadingRelative = Expr.relative[ tokens[0].type ],
		implicitRelative = leadingRelative || Expr.relative[" "],
		i = leadingRelative ? 1 : 0,

		// The foundational matcher ensures that elements are reachable from top-level context(s)
		matchContext = addCombinator( function( elem ) {
			return elem === checkContext;
		}, implicitRelative, true ),
		matchAnyContext = addCombinator( function( elem ) {
			return indexOf.call( checkContext, elem ) > -1;
		}, implicitRelative, true ),
		matchers = [ function( elem, context, xml ) {
			return ( !leadingRelative && ( xml || context !== outermostContext ) ) || (
				(checkContext = context).nodeType ?
					matchContext( elem, context, xml ) :
					matchAnyContext( elem, context, xml ) );
		} ];

	for ( ; i < len; i++ ) {
		if ( (matcher = Expr.relative[ tokens[i].type ]) ) {
			matchers = [ addCombinator(elementMatcher( matchers ), matcher) ];
		} else {
			matcher = Expr.filter[ tokens[i].type ].apply( null, tokens[i].matches );

			// Return special upon seeing a positional matcher
			if ( matcher[ expando ] ) {
				// Find the next relative operator (if any) for proper handling
				j = ++i;
				for ( ; j < len; j++ ) {
					if ( Expr.relative[ tokens[j].type ] ) {
						break;
					}
				}
				return setMatcher(
					i > 1 && elementMatcher( matchers ),
					i > 1 && toSelector(
						// If the preceding token was a descendant combinator, insert an implicit any-element `*`
						tokens.slice( 0, i - 1 ).concat({ value: tokens[ i - 2 ].type === " " ? "*" : "" })
					).replace( rtrim, "$1" ),
					matcher,
					i < j && matcherFromTokens( tokens.slice( i, j ) ),
					j < len && matcherFromTokens( (tokens = tokens.slice( j )) ),
					j < len && toSelector( tokens )
				);
			}
			matchers.push( matcher );
		}
	}

	return elementMatcher( matchers );
}

function matcherFromGroupMatchers( elementMatchers, setMatchers ) {
	var bySet = setMatchers.length > 0,
		byElement = elementMatchers.length > 0,
		superMatcher = function( seed, context, xml, results, outermost ) {
			var elem, j, matcher,
				matchedCount = 0,
				i = "0",
				unmatched = seed && [],
				setMatched = [],
				contextBackup = outermostContext,
				// We must always have either seed elements or outermost context
				elems = seed || byElement && Expr.find["TAG"]( "*", outermost ),
				// Use integer dirruns iff this is the outermost matcher
				dirrunsUnique = (dirruns += contextBackup == null ? 1 : Math.random() || 0.1),
				len = elems.length;

			if ( outermost ) {
				outermostContext = context !== document && context;
			}

			// Add elements passing elementMatchers directly to results
			// Keep `i` a string if there are no elements so `matchedCount` will be "00" below
			// Support: IE<9, Safari
			// Tolerate NodeList properties (IE: "length"; Safari: <number>) matching elements by id
			for ( ; i !== len && (elem = elems[i]) != null; i++ ) {
				if ( byElement && elem ) {
					j = 0;
					while ( (matcher = elementMatchers[j++]) ) {
						if ( matcher( elem, context, xml ) ) {
							results.push( elem );
							break;
						}
					}
					if ( outermost ) {
						dirruns = dirrunsUnique;
					}
				}

				// Track unmatched elements for set filters
				if ( bySet ) {
					// They will have gone through all possible matchers
					if ( (elem = !matcher && elem) ) {
						matchedCount--;
					}

					// Lengthen the array for every element, matched or not
					if ( seed ) {
						unmatched.push( elem );
					}
				}
			}

			// Apply set filters to unmatched elements
			matchedCount += i;
			if ( bySet && i !== matchedCount ) {
				j = 0;
				while ( (matcher = setMatchers[j++]) ) {
					matcher( unmatched, setMatched, context, xml );
				}

				if ( seed ) {
					// Reintegrate element matches to eliminate the need for sorting
					if ( matchedCount > 0 ) {
						while ( i-- ) {
							if ( !(unmatched[i] || setMatched[i]) ) {
								setMatched[i] = pop.call( results );
							}
						}
					}

					// Discard index placeholder values to get only actual matches
					setMatched = condense( setMatched );
				}

				// Add matches to results
				push.apply( results, setMatched );

				// Seedless set matches succeeding multiple successful matchers stipulate sorting
				if ( outermost && !seed && setMatched.length > 0 &&
					( matchedCount + setMatchers.length ) > 1 ) {

					Sizzle.uniqueSort( results );
				}
			}

			// Override manipulation of globals by nested matchers
			if ( outermost ) {
				dirruns = dirrunsUnique;
				outermostContext = contextBackup;
			}

			return unmatched;
		};

	return bySet ?
		markFunction( superMatcher ) :
		superMatcher;
}

compile = Sizzle.compile = function( selector, match /* Internal Use Only */ ) {
	var i,
		setMatchers = [],
		elementMatchers = [],
		cached = compilerCache[ selector + " " ];

	if ( !cached ) {
		// Generate a function of recursive functions that can be used to check each element
		if ( !match ) {
			match = tokenize( selector );
		}
		i = match.length;
		while ( i-- ) {
			cached = matcherFromTokens( match[i] );
			if ( cached[ expando ] ) {
				setMatchers.push( cached );
			} else {
				elementMatchers.push( cached );
			}
		}

		// Cache the compiled function
		cached = compilerCache( selector, matcherFromGroupMatchers( elementMatchers, setMatchers ) );

		// Save selector and tokenization
		cached.selector = selector;
	}
	return cached;
};

/**
 * A low-level selection function that works with Sizzle's compiled
 *  selector functions
 * @param {String|Function} selector A selector or a pre-compiled
 *  selector function built with Sizzle.compile
 * @param {Element} context
 * @param {Array} [results]
 * @param {Array} [seed] A set of elements to match against
 */
select = Sizzle.select = function( selector, context, results, seed ) {
	var i, tokens, token, type, find,
		compiled = typeof selector === "function" && selector,
		match = !seed && tokenize( (selector = compiled.selector || selector) );

	results = results || [];

	// Try to minimize operations if there is no seed and only one group
	if ( match.length === 1 ) {

		// Take a shortcut and set the context if the root selector is an ID
		tokens = match[0] = match[0].slice( 0 );
		if ( tokens.length > 2 && (token = tokens[0]).type === "ID" &&
				support.getById && context.nodeType === 9 && documentIsHTML &&
				Expr.relative[ tokens[1].type ] ) {

			context = ( Expr.find["ID"]( token.matches[0].replace(runescape, funescape), context ) || [] )[0];
			if ( !context ) {
				return results;

			// Precompiled matchers will still verify ancestry, so step up a level
			} else if ( compiled ) {
				context = context.parentNode;
			}

			selector = selector.slice( tokens.shift().value.length );
		}

		// Fetch a seed set for right-to-left matching
		i = matchExpr["needsContext"].test( selector ) ? 0 : tokens.length;
		while ( i-- ) {
			token = tokens[i];

			// Abort if we hit a combinator
			if ( Expr.relative[ (type = token.type) ] ) {
				break;
			}
			if ( (find = Expr.find[ type ]) ) {
				// Search, expanding context for leading sibling combinators
				if ( (seed = find(
					token.matches[0].replace( runescape, funescape ),
					rsibling.test( tokens[0].type ) && testContext( context.parentNode ) || context
				)) ) {

					// If seed is empty or no tokens remain, we can return early
					tokens.splice( i, 1 );
					selector = seed.length && toSelector( tokens );
					if ( !selector ) {
						push.apply( results, seed );
						return results;
					}

					break;
				}
			}
		}
	}

	// Compile and execute a filtering function if one is not provided
	// Provide `match` to avoid retokenization if we modified the selector above
	( compiled || compile( selector, match ) )(
		seed,
		context,
		!documentIsHTML,
		results,
		rsibling.test( selector ) && testContext( context.parentNode ) || context
	);
	return results;
};

// One-time assignments

// Sort stability
support.sortStable = expando.split("").sort( sortOrder ).join("") === expando;

// Support: Chrome<14
// Always assume duplicates if they aren't passed to the comparison function
support.detectDuplicates = !!hasDuplicate;

// Initialize against the default document
setDocument();

// Support: Webkit<537.32 - Safari 6.0.3/Chrome 25 (fixed in Chrome 27)
// Detached nodes confoundingly follow *each other*
support.sortDetached = assert(function( div1 ) {
	// Should return 1, but returns 4 (following)
	return div1.compareDocumentPosition( document.createElement("div") ) & 1;
});

// Support: IE<8
// Prevent attribute/property "interpolation"
// http://msdn.microsoft.com/en-us/library/ms536429%28VS.85%29.aspx
if ( !assert(function( div ) {
	div.innerHTML = "<a href='#'></a>";
	return div.firstChild.getAttribute("href") === "#" ;
}) ) {
	addHandle( "type|href|height|width", function( elem, name, isXML ) {
		if ( !isXML ) {
			return elem.getAttribute( name, name.toLowerCase() === "type" ? 1 : 2 );
		}
	});
}

// Support: IE<9
// Use defaultValue in place of getAttribute("value")
if ( !support.attributes || !assert(function( div ) {
	div.innerHTML = "<input/>";
	div.firstChild.setAttribute( "value", "" );
	return div.firstChild.getAttribute( "value" ) === "";
}) ) {
	addHandle( "value", function( elem, name, isXML ) {
		if ( !isXML && elem.nodeName.toLowerCase() === "input" ) {
			return elem.defaultValue;
		}
	});
}

// Support: IE<9
// Use getAttributeNode to fetch booleans when getAttribute lies
if ( !assert(function( div ) {
	return div.getAttribute("disabled") == null;
}) ) {
	addHandle( booleans, function( elem, name, isXML ) {
		var val;
		if ( !isXML ) {
			return elem[ name ] === true ? name.toLowerCase() :
					(val = elem.getAttributeNode( name )) && val.specified ?
					val.value :
				null;
		}
	});
}

return Sizzle;

})( window );



jQuery.find = Sizzle;
jQuery.expr = Sizzle.selectors;
jQuery.expr[":"] = jQuery.expr.pseudos;
jQuery.unique = Sizzle.uniqueSort;
jQuery.text = Sizzle.getText;
jQuery.isXMLDoc = Sizzle.isXML;
jQuery.contains = Sizzle.contains;



var rneedsContext = jQuery.expr.match.needsContext;

var rsingleTag = (/^<(\w+)\s*\/?>(?:<\/\1>|)$/);



var risSimple = /^.[^:#\[\.,]*$/;

// Implement the identical functionality for filter and not
function winnow( elements, qualifier, not ) {
	if ( jQuery.isFunction( qualifier ) ) {
		return jQuery.grep( elements, function( elem, i ) {
			/* jshint -W018 */
			return !!qualifier.call( elem, i, elem ) !== not;
		});

	}

	if ( qualifier.nodeType ) {
		return jQuery.grep( elements, function( elem ) {
			return ( elem === qualifier ) !== not;
		});

	}

	if ( typeof qualifier === "string" ) {
		if ( risSimple.test( qualifier ) ) {
			return jQuery.filter( qualifier, elements, not );
		}

		qualifier = jQuery.filter( qualifier, elements );
	}

	return jQuery.grep( elements, function( elem ) {
		return ( indexOf.call( qualifier, elem ) >= 0 ) !== not;
	});
}

jQuery.filter = function( expr, elems, not ) {
	var elem = elems[ 0 ];

	if ( not ) {
		expr = ":not(" + expr + ")";
	}

	return elems.length === 1 && elem.nodeType === 1 ?
		jQuery.find.matchesSelector( elem, expr ) ? [ elem ] : [] :
		jQuery.find.matches( expr, jQuery.grep( elems, function( elem ) {
			return elem.nodeType === 1;
		}));
};

jQuery.fn.extend({
	find: function( selector ) {
		var i,
			len = this.length,
			ret = [],
			self = this;

		if ( typeof selector !== "string" ) {
			return this.pushStack( jQuery( selector ).filter(function() {
				for ( i = 0; i < len; i++ ) {
					if ( jQuery.contains( self[ i ], this ) ) {
						return true;
					}
				}
			}) );
		}

		for ( i = 0; i < len; i++ ) {
			jQuery.find( selector, self[ i ], ret );
		}

		// Needed because $( selector, context ) becomes $( context ).find( selector )
		ret = this.pushStack( len > 1 ? jQuery.unique( ret ) : ret );
		ret.selector = this.selector ? this.selector + " " + selector : selector;
		return ret;
	},
	filter: function( selector ) {
		return this.pushStack( winnow(this, selector || [], false) );
	},
	not: function( selector ) {
		return this.pushStack( winnow(this, selector || [], true) );
	},
	is: function( selector ) {
		return !!winnow(
			this,

			// If this is a positional/relative selector, check membership in the returned set
			// so $("p:first").is("p:last") won't return true for a doc with two "p".
			typeof selector === "string" && rneedsContext.test( selector ) ?
				jQuery( selector ) :
				selector || [],
			false
		).length;
	}
});


// Initialize a jQuery object


// A central reference to the root jQuery(document)
var rootjQuery,

	// A simple way to check for HTML strings
	// Prioritize #id over <tag> to avoid XSS via location.hash (#9521)
	// Strict HTML recognition (#11290: must start with <)
	rquickExpr = /^(?:\s*(<[\w\W]+>)[^>]*|#([\w-]*))$/,

	init = jQuery.fn.init = function( selector, context ) {
		var match, elem;

		// HANDLE: $(""), $(null), $(undefined), $(false)
		if ( !selector ) {
			return this;
		}

		// Handle HTML strings
		if ( typeof selector === "string" ) {
			if ( selector[0] === "<" && selector[ selector.length - 1 ] === ">" && selector.length >= 3 ) {
				// Assume that strings that start and end with <> are HTML and skip the regex check
				match = [ null, selector, null ];

			} else {
				match = rquickExpr.exec( selector );
			}

			// Match html or make sure no context is specified for #id
			if ( match && (match[1] || !context) ) {

				// HANDLE: $(html) -> $(array)
				if ( match[1] ) {
					context = context instanceof jQuery ? context[0] : context;

					// scripts is true for back-compat
					// Intentionally let the error be thrown if parseHTML is not present
					jQuery.merge( this, jQuery.parseHTML(
						match[1],
						context && context.nodeType ? context.ownerDocument || context : document,
						true
					) );

					// HANDLE: $(html, props)
					if ( rsingleTag.test( match[1] ) && jQuery.isPlainObject( context ) ) {
						for ( match in context ) {
							// Properties of context are called as methods if possible
							if ( jQuery.isFunction( this[ match ] ) ) {
								this[ match ]( context[ match ] );

							// ...and otherwise set as attributes
							} else {
								this.attr( match, context[ match ] );
							}
						}
					}

					return this;

				// HANDLE: $(#id)
				} else {
					elem = document.getElementById( match[2] );

					// Check parentNode to catch when Blackberry 4.6 returns
					// nodes that are no longer in the document #6963
					if ( elem && elem.parentNode ) {
						// Inject the element directly into the jQuery object
						this.length = 1;
						this[0] = elem;
					}

					this.context = document;
					this.selector = selector;
					return this;
				}

			// HANDLE: $(expr, $(...))
			} else if ( !context || context.jquery ) {
				return ( context || rootjQuery ).find( selector );

			// HANDLE: $(expr, context)
			// (which is just equivalent to: $(context).find(expr)
			} else {
				return this.constructor( context ).find( selector );
			}

		// HANDLE: $(DOMElement)
		} else if ( selector.nodeType ) {
			this.context = this[0] = selector;
			this.length = 1;
			return this;

		// HANDLE: $(function)
		// Shortcut for document ready
		} else if ( jQuery.isFunction( selector ) ) {
			return typeof rootjQuery.ready !== "undefined" ?
				rootjQuery.ready( selector ) :
				// Execute immediately if ready is not present
				selector( jQuery );
		}

		if ( selector.selector !== undefined ) {
			this.selector = selector.selector;
			this.context = selector.context;
		}

		return jQuery.makeArray( selector, this );
	};

// Give the init function the jQuery prototype for later instantiation
init.prototype = jQuery.fn;

// Initialize central reference
rootjQuery = jQuery( document );


var rparentsprev = /^(?:parents|prev(?:Until|All))/,
	// methods guaranteed to produce a unique set when starting from a unique set
	guaranteedUnique = {
		children: true,
		contents: true,
		next: true,
		prev: true
	};

jQuery.extend({
	dir: function( elem, dir, until ) {
		var matched = [],
			truncate = until !== undefined;

		while ( (elem = elem[ dir ]) && elem.nodeType !== 9 ) {
			if ( elem.nodeType === 1 ) {
				if ( truncate && jQuery( elem ).is( until ) ) {
					break;
				}
				matched.push( elem );
			}
		}
		return matched;
	},

	sibling: function( n, elem ) {
		var matched = [];

		for ( ; n; n = n.nextSibling ) {
			if ( n.nodeType === 1 && n !== elem ) {
				matched.push( n );
			}
		}

		return matched;
	}
});

jQuery.fn.extend({
	has: function( target ) {
		var targets = jQuery( target, this ),
			l = targets.length;

		return this.filter(function() {
			var i = 0;
			for ( ; i < l; i++ ) {
				if ( jQuery.contains( this, targets[i] ) ) {
					return true;
				}
			}
		});
	},

	closest: function( selectors, context ) {
		var cur,
			i = 0,
			l = this.length,
			matched = [],
			pos = rneedsContext.test( selectors ) || typeof selectors !== "string" ?
				jQuery( selectors, context || this.context ) :
				0;

		for ( ; i < l; i++ ) {
			for ( cur = this[i]; cur && cur !== context; cur = cur.parentNode ) {
				// Always skip document fragments
				if ( cur.nodeType < 11 && (pos ?
					pos.index(cur) > -1 :

					// Don't pass non-elements to Sizzle
					cur.nodeType === 1 &&
						jQuery.find.matchesSelector(cur, selectors)) ) {

					matched.push( cur );
					break;
				}
			}
		}

		return this.pushStack( matched.length > 1 ? jQuery.unique( matched ) : matched );
	},

	// Determine the position of an element within
	// the matched set of elements
	index: function( elem ) {

		// No argument, return index in parent
		if ( !elem ) {
			return ( this[ 0 ] && this[ 0 ].parentNode ) ? this.first().prevAll().length : -1;
		}

		// index in selector
		if ( typeof elem === "string" ) {
			return indexOf.call( jQuery( elem ), this[ 0 ] );
		}

		// Locate the position of the desired element
		return indexOf.call( this,

			// If it receives a jQuery object, the first element is used
			elem.jquery ? elem[ 0 ] : elem
		);
	},

	add: function( selector, context ) {
		return this.pushStack(
			jQuery.unique(
				jQuery.merge( this.get(), jQuery( selector, context ) )
			)
		);
	},

	addBack: function( selector ) {
		return this.add( selector == null ?
			this.prevObject : this.prevObject.filter(selector)
		);
	}
});

function sibling( cur, dir ) {
	while ( (cur = cur[dir]) && cur.nodeType !== 1 ) {}
	return cur;
}

jQuery.each({
	parent: function( elem ) {
		var parent = elem.parentNode;
		return parent && parent.nodeType !== 11 ? parent : null;
	},
	parents: function( elem ) {
		return jQuery.dir( elem, "parentNode" );
	},
	parentsUntil: function( elem, i, until ) {
		return jQuery.dir( elem, "parentNode", until );
	},
	next: function( elem ) {
		return sibling( elem, "nextSibling" );
	},
	prev: function( elem ) {
		return sibling( elem, "previousSibling" );
	},
	nextAll: function( elem ) {
		return jQuery.dir( elem, "nextSibling" );
	},
	prevAll: function( elem ) {
		return jQuery.dir( elem, "previousSibling" );
	},
	nextUntil: function( elem, i, until ) {
		return jQuery.dir( elem, "nextSibling", until );
	},
	prevUntil: function( elem, i, until ) {
		return jQuery.dir( elem, "previousSibling", until );
	},
	siblings: function( elem ) {
		return jQuery.sibling( ( elem.parentNode || {} ).firstChild, elem );
	},
	children: function( elem ) {
		return jQuery.sibling( elem.firstChild );
	},
	contents: function( elem ) {
		return elem.contentDocument || jQuery.merge( [], elem.childNodes );
	}
}, function( name, fn ) {
	jQuery.fn[ name ] = function( until, selector ) {
		var matched = jQuery.map( this, fn, until );

		if ( name.slice( -5 ) !== "Until" ) {
			selector = until;
		}

		if ( selector && typeof selector === "string" ) {
			matched = jQuery.filter( selector, matched );
		}

		if ( this.length > 1 ) {
			// Remove duplicates
			if ( !guaranteedUnique[ name ] ) {
				jQuery.unique( matched );
			}

			// Reverse order for parents* and prev-derivatives
			if ( rparentsprev.test( name ) ) {
				matched.reverse();
			}
		}

		return this.pushStack( matched );
	};
});
var rnotwhite = (/\S+/g);



// String to Object options format cache
var optionsCache = {};

// Convert String-formatted options into Object-formatted ones and store in cache
function createOptions( options ) {
	var object = optionsCache[ options ] = {};
	jQuery.each( options.match( rnotwhite ) || [], function( _, flag ) {
		object[ flag ] = true;
	});
	return object;
}

/*
 * Create a callback list using the following parameters:
 *
 *	options: an optional list of space-separated options that will change how
 *			the callback list behaves or a more traditional option object
 *
 * By default a callback list will act like an event callback list and can be
 * "fired" multiple times.
 *
 * Possible options:
 *
 *	once:			will ensure the callback list can only be fired once (like a Deferred)
 *
 *	memory:			will keep track of previous values and will call any callback added
 *					after the list has been fired right away with the latest "memorized"
 *					values (like a Deferred)
 *
 *	unique:			will ensure a callback can only be added once (no duplicate in the list)
 *
 *	stopOnFalse:	interrupt callings when a callback returns false
 *
 */
jQuery.Callbacks = function( options ) {

	// Convert options from String-formatted to Object-formatted if needed
	// (we check in cache first)
	options = typeof options === "string" ?
		( optionsCache[ options ] || createOptions( options ) ) :
		jQuery.extend( {}, options );

	var // Last fire value (for non-forgettable lists)
		memory,
		// Flag to know if list was already fired
		fired,
		// Flag to know if list is currently firing
		firing,
		// First callback to fire (used internally by add and fireWith)
		firingStart,
		// End of the loop when firing
		firingLength,
		// Index of currently firing callback (modified by remove if needed)
		firingIndex,
		// Actual callback list
		list = [],
		// Stack of fire calls for repeatable lists
		stack = !options.once && [],
		// Fire callbacks
		fire = function( data ) {
			memory = options.memory && data;
			fired = true;
			firingIndex = firingStart || 0;
			firingStart = 0;
			firingLength = list.length;
			firing = true;
			for ( ; list && firingIndex < firingLength; firingIndex++ ) {
				if ( list[ firingIndex ].apply( data[ 0 ], data[ 1 ] ) === false && options.stopOnFalse ) {
					memory = false; // To prevent further calls using add
					break;
				}
			}
			firing = false;
			if ( list ) {
				if ( stack ) {
					if ( stack.length ) {
						fire( stack.shift() );
					}
				} else if ( memory ) {
					list = [];
				} else {
					self.disable();
				}
			}
		},
		// Actual Callbacks object
		self = {
			// Add a callback or a collection of callbacks to the list
			add: function() {
				if ( list ) {
					// First, we save the current length
					var start = list.length;
					(function add( args ) {
						jQuery.each( args, function( _, arg ) {
							var type = jQuery.type( arg );
							if ( type === "function" ) {
								if ( !options.unique || !self.has( arg ) ) {
									list.push( arg );
								}
							} else if ( arg && arg.length && type !== "string" ) {
								// Inspect recursively
								add( arg );
							}
						});
					})( arguments );
					// Do we need to add the callbacks to the
					// current firing batch?
					if ( firing ) {
						firingLength = list.length;
					// With memory, if we're not firing then
					// we should call right away
					} else if ( memory ) {
						firingStart = start;
						fire( memory );
					}
				}
				return this;
			},
			// Remove a callback from the list
			remove: function() {
				if ( list ) {
					jQuery.each( arguments, function( _, arg ) {
						var index;
						while ( ( index = jQuery.inArray( arg, list, index ) ) > -1 ) {
							list.splice( index, 1 );
							// Handle firing indexes
							if ( firing ) {
								if ( index <= firingLength ) {
									firingLength--;
								}
								if ( index <= firingIndex ) {
									firingIndex--;
								}
							}
						}
					});
				}
				return this;
			},
			// Check if a given callback is in the list.
			// If no argument is given, return whether or not list has callbacks attached.
			has: function( fn ) {
				return fn ? jQuery.inArray( fn, list ) > -1 : !!( list && list.length );
			},
			// Remove all callbacks from the list
			empty: function() {
				list = [];
				firingLength = 0;
				return this;
			},
			// Have the list do nothing anymore
			disable: function() {
				list = stack = memory = undefined;
				return this;
			},
			// Is it disabled?
			disabled: function() {
				return !list;
			},
			// Lock the list in its current state
			lock: function() {
				stack = undefined;
				if ( !memory ) {
					self.disable();
				}
				return this;
			},
			// Is it locked?
			locked: function() {
				return !stack;
			},
			// Call all callbacks with the given context and arguments
			fireWith: function( context, args ) {
				if ( list && ( !fired || stack ) ) {
					args = args || [];
					args = [ context, args.slice ? args.slice() : args ];
					if ( firing ) {
						stack.push( args );
					} else {
						fire( args );
					}
				}
				return this;
			},
			// Call all the callbacks with the given arguments
			fire: function() {
				self.fireWith( this, arguments );
				return this;
			},
			// To know if the callbacks have already been called at least once
			fired: function() {
				return !!fired;
			}
		};

	return self;
};


jQuery.extend({

	Deferred: function( func ) {
		var tuples = [
				// action, add listener, listener list, final state
				[ "resolve", "done", jQuery.Callbacks("once memory"), "resolved" ],
				[ "reject", "fail", jQuery.Callbacks("once memory"), "rejected" ],
				[ "notify", "progress", jQuery.Callbacks("memory") ]
			],
			state = "pending",
			promise = {
				state: function() {
					return state;
				},
				always: function() {
					deferred.done( arguments ).fail( arguments );
					return this;
				},
				then: function( /* fnDone, fnFail, fnProgress */ ) {
					var fns = arguments;
					return jQuery.Deferred(function( newDefer ) {
						jQuery.each( tuples, function( i, tuple ) {
							var fn = jQuery.isFunction( fns[ i ] ) && fns[ i ];
							// deferred[ done | fail | progress ] for forwarding actions to newDefer
							deferred[ tuple[1] ](function() {
								var returned = fn && fn.apply( this, arguments );
								if ( returned && jQuery.isFunction( returned.promise ) ) {
									returned.promise()
										.done( newDefer.resolve )
										.fail( newDefer.reject )
										.progress( newDefer.notify );
								} else {
									newDefer[ tuple[ 0 ] + "With" ]( this === promise ? newDefer.promise() : this, fn ? [ returned ] : arguments );
								}
							});
						});
						fns = null;
					}).promise();
				},
				// Get a promise for this deferred
				// If obj is provided, the promise aspect is added to the object
				promise: function( obj ) {
					return obj != null ? jQuery.extend( obj, promise ) : promise;
				}
			},
			deferred = {};

		// Keep pipe for back-compat
		promise.pipe = promise.then;

		// Add list-specific methods
		jQuery.each( tuples, function( i, tuple ) {
			var list = tuple[ 2 ],
				stateString = tuple[ 3 ];

			// promise[ done | fail | progress ] = list.add
			promise[ tuple[1] ] = list.add;

			// Handle state
			if ( stateString ) {
				list.add(function() {
					// state = [ resolved | rejected ]
					state = stateString;

				// [ reject_list | resolve_list ].disable; progress_list.lock
				}, tuples[ i ^ 1 ][ 2 ].disable, tuples[ 2 ][ 2 ].lock );
			}

			// deferred[ resolve | reject | notify ]
			deferred[ tuple[0] ] = function() {
				deferred[ tuple[0] + "With" ]( this === deferred ? promise : this, arguments );
				return this;
			};
			deferred[ tuple[0] + "With" ] = list.fireWith;
		});

		// Make the deferred a promise
		promise.promise( deferred );

		// Call given func if any
		if ( func ) {
			func.call( deferred, deferred );
		}

		// All done!
		return deferred;
	},

	// Deferred helper
	when: function( subordinate /* , ..., subordinateN */ ) {
		var i = 0,
			resolveValues = slice.call( arguments ),
			length = resolveValues.length,

			// the count of uncompleted subordinates
			remaining = length !== 1 || ( subordinate && jQuery.isFunction( subordinate.promise ) ) ? length : 0,

			// the master Deferred. If resolveValues consist of only a single Deferred, just use that.
			deferred = remaining === 1 ? subordinate : jQuery.Deferred(),

			// Update function for both resolve and progress values
			updateFunc = function( i, contexts, values ) {
				return function( value ) {
					contexts[ i ] = this;
					values[ i ] = arguments.length > 1 ? slice.call( arguments ) : value;
					if ( values === progressValues ) {
						deferred.notifyWith( contexts, values );
					} else if ( !( --remaining ) ) {
						deferred.resolveWith( contexts, values );
					}
				};
			},

			progressValues, progressContexts, resolveContexts;

		// add listeners to Deferred subordinates; treat others as resolved
		if ( length > 1 ) {
			progressValues = new Array( length );
			progressContexts = new Array( length );
			resolveContexts = new Array( length );
			for ( ; i < length; i++ ) {
				if ( resolveValues[ i ] && jQuery.isFunction( resolveValues[ i ].promise ) ) {
					resolveValues[ i ].promise()
						.done( updateFunc( i, resolveContexts, resolveValues ) )
						.fail( deferred.reject )
						.progress( updateFunc( i, progressContexts, progressValues ) );
				} else {
					--remaining;
				}
			}
		}

		// if we're not waiting on anything, resolve the master
		if ( !remaining ) {
			deferred.resolveWith( resolveContexts, resolveValues );
		}

		return deferred.promise();
	}
});


// The deferred used on DOM ready
var readyList;

jQuery.fn.ready = function( fn ) {
	// Add the callback
	jQuery.ready.promise().done( fn );

	return this;
};

jQuery.extend({
	// Is the DOM ready to be used? Set to true once it occurs.
	isReady: false,

	// A counter to track how many items to wait for before
	// the ready event fires. See #6781
	readyWait: 1,

	// Hold (or release) the ready event
	holdReady: function( hold ) {
		if ( hold ) {
			jQuery.readyWait++;
		} else {
			jQuery.ready( true );
		}
	},

	// Handle when the DOM is ready
	ready: function( wait ) {

		// Abort if there are pending holds or we're already ready
		if ( wait === true ? --jQuery.readyWait : jQuery.isReady ) {
			return;
		}

		// Remember that the DOM is ready
		jQuery.isReady = true;

		// If a normal DOM Ready event fired, decrement, and wait if need be
		if ( wait !== true && --jQuery.readyWait > 0 ) {
			return;
		}

		// If there are functions bound, to execute
		readyList.resolveWith( document, [ jQuery ] );

		// Trigger any bound ready events
		if ( jQuery.fn.triggerHandler ) {
			jQuery( document ).triggerHandler( "ready" );
			jQuery( document ).off( "ready" );
		}
	}
});

/**
 * The ready event handler and self cleanup method
 */
function completed() {
	document.removeEventListener( "DOMContentLoaded", completed, false );
	window.removeEventListener( "load", completed, false );
	jQuery.ready();
}

jQuery.ready.promise = function( obj ) {
	if ( !readyList ) {

		readyList = jQuery.Deferred();

		// Catch cases where $(document).ready() is called after the browser event has already occurred.
		// we once tried to use readyState "interactive" here, but it caused issues like the one
		// discovered by ChrisS here: http://bugs.jquery.com/ticket/12282#comment:15
		if ( document.readyState === "complete" ) {
			// Handle it asynchronously to allow scripts the opportunity to delay ready
			setTimeout( jQuery.ready );

		} else {

			// Use the handy event callback
			document.addEventListener( "DOMContentLoaded", completed, false );

			// A fallback to window.onload, that will always work
			window.addEventListener( "load", completed, false );
		}
	}
	return readyList.promise( obj );
};

// Kick off the DOM ready check even if the user does not
jQuery.ready.promise();




// Multifunctional method to get and set values of a collection
// The value/s can optionally be executed if it's a function
var access = jQuery.access = function( elems, fn, key, value, chainable, emptyGet, raw ) {
	var i = 0,
		len = elems.length,
		bulk = key == null;

	// Sets many values
	if ( jQuery.type( key ) === "object" ) {
		chainable = true;
		for ( i in key ) {
			jQuery.access( elems, fn, i, key[i], true, emptyGet, raw );
		}

	// Sets one value
	} else if ( value !== undefined ) {
		chainable = true;

		if ( !jQuery.isFunction( value ) ) {
			raw = true;
		}

		if ( bulk ) {
			// Bulk operations run against the entire set
			if ( raw ) {
				fn.call( elems, value );
				fn = null;

			// ...except when executing function values
			} else {
				bulk = fn;
				fn = function( elem, key, value ) {
					return bulk.call( jQuery( elem ), value );
				};
			}
		}

		if ( fn ) {
			for ( ; i < len; i++ ) {
				fn( elems[i], key, raw ? value : value.call( elems[i], i, fn( elems[i], key ) ) );
			}
		}
	}

	return chainable ?
		elems :

		// Gets
		bulk ?
			fn.call( elems ) :
			len ? fn( elems[0], key ) : emptyGet;
};


/**
 * Determines whether an object can have data
 */
jQuery.acceptData = function( owner ) {
	// Accepts only:
	//  - Node
	//    - Node.ELEMENT_NODE
	//    - Node.DOCUMENT_NODE
	//  - Object
	//    - Any
	/* jshint -W018 */
	return owner.nodeType === 1 || owner.nodeType === 9 || !( +owner.nodeType );
};


function Data() {
	// Support: Android < 4,
	// Old WebKit does not have Object.preventExtensions/freeze method,
	// return new empty object instead with no [[set]] accessor
	Object.defineProperty( this.cache = {}, 0, {
		get: function() {
			return {};
		}
	});

	this.expando = jQuery.expando + Math.random();
}

Data.uid = 1;
Data.accepts = jQuery.acceptData;

Data.prototype = {
	key: function( owner ) {
		// We can accept data for non-element nodes in modern browsers,
		// but we should not, see #8335.
		// Always return the key for a frozen object.
		if ( !Data.accepts( owner ) ) {
			return 0;
		}

		var descriptor = {},
			// Check if the owner object already has a cache key
			unlock = owner[ this.expando ];

		// If not, create one
		if ( !unlock ) {
			unlock = Data.uid++;

			// Secure it in a non-enumerable, non-writable property
			try {
				descriptor[ this.expando ] = { value: unlock };
				Object.defineProperties( owner, descriptor );

			// Support: Android < 4
			// Fallback to a less secure definition
			} catch ( e ) {
				descriptor[ this.expando ] = unlock;
				jQuery.extend( owner, descriptor );
			}
		}

		// Ensure the cache object
		if ( !this.cache[ unlock ] ) {
			this.cache[ unlock ] = {};
		}

		return unlock;
	},
	set: function( owner, data, value ) {
		var prop,
			// There may be an unlock assigned to this node,
			// if there is no entry for this "owner", create one inline
			// and set the unlock as though an owner entry had always existed
			unlock = this.key( owner ),
			cache = this.cache[ unlock ];

		// Handle: [ owner, key, value ] args
		if ( typeof data === "string" ) {
			cache[ data ] = value;

		// Handle: [ owner, { properties } ] args
		} else {
			// Fresh assignments by object are shallow copied
			if ( jQuery.isEmptyObject( cache ) ) {
				jQuery.extend( this.cache[ unlock ], data );
			// Otherwise, copy the properties one-by-one to the cache object
			} else {
				for ( prop in data ) {
					cache[ prop ] = data[ prop ];
				}
			}
		}
		return cache;
	},
	get: function( owner, key ) {
		// Either a valid cache is found, or will be created.
		// New caches will be created and the unlock returned,
		// allowing direct access to the newly created
		// empty data object. A valid owner object must be provided.
		var cache = this.cache[ this.key( owner ) ];

		return key === undefined ?
			cache : cache[ key ];
	},
	access: function( owner, key, value ) {
		var stored;
		// In cases where either:
		//
		//   1. No key was specified
		//   2. A string key was specified, but no value provided
		//
		// Take the "read" path and allow the get method to determine
		// which value to return, respectively either:
		//
		//   1. The entire cache object
		//   2. The data stored at the key
		//
		if ( key === undefined ||
				((key && typeof key === "string") && value === undefined) ) {

			stored = this.get( owner, key );

			return stored !== undefined ?
				stored : this.get( owner, jQuery.camelCase(key) );
		}

		// [*]When the key is not a string, or both a key and value
		// are specified, set or extend (existing objects) with either:
		//
		//   1. An object of properties
		//   2. A key and value
		//
		this.set( owner, key, value );

		// Since the "set" path can have two possible entry points
		// return the expected data based on which path was taken[*]
		return value !== undefined ? value : key;
	},
	remove: function( owner, key ) {
		var i, name, camel,
			unlock = this.key( owner ),
			cache = this.cache[ unlock ];

		if ( key === undefined ) {
			this.cache[ unlock ] = {};

		} else {
			// Support array or space separated string of keys
			if ( jQuery.isArray( key ) ) {
				// If "name" is an array of keys...
				// When data is initially created, via ("key", "val") signature,
				// keys will be converted to camelCase.
				// Since there is no way to tell _how_ a key was added, remove
				// both plain key and camelCase key. #12786
				// This will only penalize the array argument path.
				name = key.concat( key.map( jQuery.camelCase ) );
			} else {
				camel = jQuery.camelCase( key );
				// Try the string as a key before any manipulation
				if ( key in cache ) {
					name = [ key, camel ];
				} else {
					// If a key with the spaces exists, use it.
					// Otherwise, create an array by matching non-whitespace
					name = camel;
					name = name in cache ?
						[ name ] : ( name.match( rnotwhite ) || [] );
				}
			}

			i = name.length;
			while ( i-- ) {
				delete cache[ name[ i ] ];
			}
		}
	},
	hasData: function( owner ) {
		return !jQuery.isEmptyObject(
			this.cache[ owner[ this.expando ] ] || {}
		);
	},
	discard: function( owner ) {
		if ( owner[ this.expando ] ) {
			delete this.cache[ owner[ this.expando ] ];
		}
	}
};
var data_priv = new Data();

var data_user = new Data();



/*
	Implementation Summary

	1. Enforce API surface and semantic compatibility with 1.9.x branch
	2. Improve the module's maintainability by reducing the storage
		paths to a single mechanism.
	3. Use the same single mechanism to support "private" and "user" data.
	4. _Never_ expose "private" data to user code (TODO: Drop _data, _removeData)
	5. Avoid exposing implementation details on user objects (eg. expando properties)
	6. Provide a clear path for implementation upgrade to WeakMap in 2014
*/
var rbrace = /^(?:\{[\w\W]*\}|\[[\w\W]*\])$/,
	rmultiDash = /([A-Z])/g;

function dataAttr( elem, key, data ) {
	var name;

	// If nothing was found internally, try to fetch any
	// data from the HTML5 data-* attribute
	if ( data === undefined && elem.nodeType === 1 ) {
		name = "data-" + key.replace( rmultiDash, "-$1" ).toLowerCase();
		data = elem.getAttribute( name );

		if ( typeof data === "string" ) {
			try {
				data = data === "true" ? true :
					data === "false" ? false :
					data === "null" ? null :
					// Only convert to a number if it doesn't change the string
					+data + "" === data ? +data :
					rbrace.test( data ) ? jQuery.parseJSON( data ) :
					data;
			} catch( e ) {}

			// Make sure we set the data so it isn't changed later
			data_user.set( elem, key, data );
		} else {
			data = undefined;
		}
	}
	return data;
}

jQuery.extend({
	hasData: function( elem ) {
		return data_user.hasData( elem ) || data_priv.hasData( elem );
	},

	data: function( elem, name, data ) {
		return data_user.access( elem, name, data );
	},

	removeData: function( elem, name ) {
		data_user.remove( elem, name );
	},

	// TODO: Now that all calls to _data and _removeData have been replaced
	// with direct calls to data_priv methods, these can be deprecated.
	_data: function( elem, name, data ) {
		return data_priv.access( elem, name, data );
	},

	_removeData: function( elem, name ) {
		data_priv.remove( elem, name );
	}
});

jQuery.fn.extend({
	data: function( key, value ) {
		var i, name, data,
			elem = this[ 0 ],
			attrs = elem && elem.attributes;

		// Gets all values
		if ( key === undefined ) {
			if ( this.length ) {
				data = data_user.get( elem );

				if ( elem.nodeType === 1 && !data_priv.get( elem, "hasDataAttrs" ) ) {
					i = attrs.length;
					while ( i-- ) {

						// Support: IE11+
						// The attrs elements can be null (#14894)
						if ( attrs[ i ] ) {
							name = attrs[ i ].name;
							if ( name.indexOf( "data-" ) === 0 ) {
								name = jQuery.camelCase( name.slice(5) );
								dataAttr( elem, name, data[ name ] );
							}
						}
					}
					data_priv.set( elem, "hasDataAttrs", true );
				}
			}

			return data;
		}

		// Sets multiple values
		if ( typeof key === "object" ) {
			return this.each(function() {
				data_user.set( this, key );
			});
		}

		return access( this, function( value ) {
			var data,
				camelKey = jQuery.camelCase( key );

			// The calling jQuery object (element matches) is not empty
			// (and therefore has an element appears at this[ 0 ]) and the
			// `value` parameter was not undefined. An empty jQuery object
			// will result in `undefined` for elem = this[ 0 ] which will
			// throw an exception if an attempt to read a data cache is made.
			if ( elem && value === undefined ) {
				// Attempt to get data from the cache
				// with the key as-is
				data = data_user.get( elem, key );
				if ( data !== undefined ) {
					return data;
				}

				// Attempt to get data from the cache
				// with the key camelized
				data = data_user.get( elem, camelKey );
				if ( data !== undefined ) {
					return data;
				}

				// Attempt to "discover" the data in
				// HTML5 custom data-* attrs
				data = dataAttr( elem, camelKey, undefined );
				if ( data !== undefined ) {
					return data;
				}

				// We tried really hard, but the data doesn't exist.
				return;
			}

			// Set the data...
			this.each(function() {
				// First, attempt to store a copy or reference of any
				// data that might've been store with a camelCased key.
				var data = data_user.get( this, camelKey );

				// For HTML5 data-* attribute interop, we have to
				// store property names with dashes in a camelCase form.
				// This might not apply to all properties...*
				data_user.set( this, camelKey, value );

				// *... In the case of properties that might _actually_
				// have dashes, we need to also store a copy of that
				// unchanged property.
				if ( key.indexOf("-") !== -1 && data !== undefined ) {
					data_user.set( this, key, value );
				}
			});
		}, null, value, arguments.length > 1, null, true );
	},

	removeData: function( key ) {
		return this.each(function() {
			data_user.remove( this, key );
		});
	}
});


jQuery.extend({
	queue: function( elem, type, data ) {
		var queue;

		if ( elem ) {
			type = ( type || "fx" ) + "queue";
			queue = data_priv.get( elem, type );

			// Speed up dequeue by getting out quickly if this is just a lookup
			if ( data ) {
				if ( !queue || jQuery.isArray( data ) ) {
					queue = data_priv.access( elem, type, jQuery.makeArray(data) );
				} else {
					queue.push( data );
				}
			}
			return queue || [];
		}
	},

	dequeue: function( elem, type ) {
		type = type || "fx";

		var queue = jQuery.queue( elem, type ),
			startLength = queue.length,
			fn = queue.shift(),
			hooks = jQuery._queueHooks( elem, type ),
			next = function() {
				jQuery.dequeue( elem, type );
			};

		// If the fx queue is dequeued, always remove the progress sentinel
		if ( fn === "inprogress" ) {
			fn = queue.shift();
			startLength--;
		}

		if ( fn ) {

			// Add a progress sentinel to prevent the fx queue from being
			// automatically dequeued
			if ( type === "fx" ) {
				queue.unshift( "inprogress" );
			}

			// clear up the last queue stop function
			delete hooks.stop;
			fn.call( elem, next, hooks );
		}

		if ( !startLength && hooks ) {
			hooks.empty.fire();
		}
	},

	// not intended for public consumption - generates a queueHooks object, or returns the current one
	_queueHooks: function( elem, type ) {
		var key = type + "queueHooks";
		return data_priv.get( elem, key ) || data_priv.access( elem, key, {
			empty: jQuery.Callbacks("once memory").add(function() {
				data_priv.remove( elem, [ type + "queue", key ] );
			})
		});
	}
});

jQuery.fn.extend({
	queue: function( type, data ) {
		var setter = 2;

		if ( typeof type !== "string" ) {
			data = type;
			type = "fx";
			setter--;
		}

		if ( arguments.length < setter ) {
			return jQuery.queue( this[0], type );
		}

		return data === undefined ?
			this :
			this.each(function() {
				var queue = jQuery.queue( this, type, data );

				// ensure a hooks for this queue
				jQuery._queueHooks( this, type );

				if ( type === "fx" && queue[0] !== "inprogress" ) {
					jQuery.dequeue( this, type );
				}
			});
	},
	dequeue: function( type ) {
		return this.each(function() {
			jQuery.dequeue( this, type );
		});
	},
	clearQueue: function( type ) {
		return this.queue( type || "fx", [] );
	},
	// Get a promise resolved when queues of a certain type
	// are emptied (fx is the type by default)
	promise: function( type, obj ) {
		var tmp,
			count = 1,
			defer = jQuery.Deferred(),
			elements = this,
			i = this.length,
			resolve = function() {
				if ( !( --count ) ) {
					defer.resolveWith( elements, [ elements ] );
				}
			};

		if ( typeof type !== "string" ) {
			obj = type;
			type = undefined;
		}
		type = type || "fx";

		while ( i-- ) {
			tmp = data_priv.get( elements[ i ], type + "queueHooks" );
			if ( tmp && tmp.empty ) {
				count++;
				tmp.empty.add( resolve );
			}
		}
		resolve();
		return defer.promise( obj );
	}
});
var pnum = (/[+-]?(?:\d*\.|)\d+(?:[eE][+-]?\d+|)/).source;

var cssExpand = [ "Top", "Right", "Bottom", "Left" ];

var isHidden = function( elem, el ) {
		// isHidden might be called from jQuery#filter function;
		// in that case, element will be second argument
		elem = el || elem;
		return jQuery.css( elem, "display" ) === "none" || !jQuery.contains( elem.ownerDocument, elem );
	};

var rcheckableType = (/^(?:checkbox|radio)$/i);



(function() {
	var fragment = document.createDocumentFragment(),
		div = fragment.appendChild( document.createElement( "div" ) ),
		input = document.createElement( "input" );

	// #11217 - WebKit loses check when the name is after the checked attribute
	// Support: Windows Web Apps (WWA)
	// `name` and `type` need .setAttribute for WWA
	input.setAttribute( "type", "radio" );
	input.setAttribute( "checked", "checked" );
	input.setAttribute( "name", "t" );

	div.appendChild( input );

	// Support: Safari 5.1, iOS 5.1, Android 4.x, Android 2.3
	// old WebKit doesn't clone checked state correctly in fragments
	support.checkClone = div.cloneNode( true ).cloneNode( true ).lastChild.checked;

	// Make sure textarea (and checkbox) defaultValue is properly cloned
	// Support: IE9-IE11+
	div.innerHTML = "<textarea>x</textarea>";
	support.noCloneChecked = !!div.cloneNode( true ).lastChild.defaultValue;
})();
var strundefined = typeof undefined;



support.focusinBubbles = "onfocusin" in window;


var
	rkeyEvent = /^key/,
	rmouseEvent = /^(?:mouse|pointer|contextmenu)|click/,
	rfocusMorph = /^(?:focusinfocus|focusoutblur)$/,
	rtypenamespace = /^([^.]*)(?:\.(.+)|)$/;

function returnTrue() {
	return true;
}

function returnFalse() {
	return false;
}

function safeActiveElement() {
	try {
		return document.activeElement;
	} catch ( err ) { }
}

/*
 * Helper functions for managing events -- not part of the public interface.
 * Props to Dean Edwards' addEvent library for many of the ideas.
 */
jQuery.event = {

	global: {},

	add: function( elem, types, handler, data, selector ) {

		var handleObjIn, eventHandle, tmp,
			events, t, handleObj,
			special, handlers, type, namespaces, origType,
			elemData = data_priv.get( elem );

		// Don't attach events to noData or text/comment nodes (but allow plain objects)
		if ( !elemData ) {
			return;
		}

		// Caller can pass in an object of custom data in lieu of the handler
		if ( handler.handler ) {
			handleObjIn = handler;
			handler = handleObjIn.handler;
			selector = handleObjIn.selector;
		}

		// Make sure that the handler has a unique ID, used to find/remove it later
		if ( !handler.guid ) {
			handler.guid = jQuery.guid++;
		}

		// Init the element's event structure and main handler, if this is the first
		if ( !(events = elemData.events) ) {
			events = elemData.events = {};
		}
		if ( !(eventHandle = elemData.handle) ) {
			eventHandle = elemData.handle = function( e ) {
				// Discard the second event of a jQuery.event.trigger() and
				// when an event is called after a page has unloaded
				return typeof jQuery !== strundefined && jQuery.event.triggered !== e.type ?
					jQuery.event.dispatch.apply( elem, arguments ) : undefined;
			};
		}

		// Handle multiple events separated by a space
		types = ( types || "" ).match( rnotwhite ) || [ "" ];
		t = types.length;
		while ( t-- ) {
			tmp = rtypenamespace.exec( types[t] ) || [];
			type = origType = tmp[1];
			namespaces = ( tmp[2] || "" ).split( "." ).sort();

			// There *must* be a type, no attaching namespace-only handlers
			if ( !type ) {
				continue;
			}

			// If event changes its type, use the special event handlers for the changed type
			special = jQuery.event.special[ type ] || {};

			// If selector defined, determine special event api type, otherwise given type
			type = ( selector ? special.delegateType : special.bindType ) || type;

			// Update special based on newly reset type
			special = jQuery.event.special[ type ] || {};

			// handleObj is passed to all event handlers
			handleObj = jQuery.extend({
				type: type,
				origType: origType,
				data: data,
				handler: handler,
				guid: handler.guid,
				selector: selector,
				needsContext: selector && jQuery.expr.match.needsContext.test( selector ),
				namespace: namespaces.join(".")
			}, handleObjIn );

			// Init the event handler queue if we're the first
			if ( !(handlers = events[ type ]) ) {
				handlers = events[ type ] = [];
				handlers.delegateCount = 0;

				// Only use addEventListener if the special events handler returns false
				if ( !special.setup || special.setup.call( elem, data, namespaces, eventHandle ) === false ) {
					if ( elem.addEventListener ) {
						elem.addEventListener( type, eventHandle, false );
					}
				}
			}

			if ( special.add ) {
				special.add.call( elem, handleObj );

				if ( !handleObj.handler.guid ) {
					handleObj.handler.guid = handler.guid;
				}
			}

			// Add to the element's handler list, delegates in front
			if ( selector ) {
				handlers.splice( handlers.delegateCount++, 0, handleObj );
			} else {
				handlers.push( handleObj );
			}

			// Keep track of which events have ever been used, for event optimization
			jQuery.event.global[ type ] = true;
		}

	},

	// Detach an event or set of events from an element
	remove: function( elem, types, handler, selector, mappedTypes ) {

		var j, origCount, tmp,
			events, t, handleObj,
			special, handlers, type, namespaces, origType,
			elemData = data_priv.hasData( elem ) && data_priv.get( elem );

		if ( !elemData || !(events = elemData.events) ) {
			return;
		}

		// Once for each type.namespace in types; type may be omitted
		types = ( types || "" ).match( rnotwhite ) || [ "" ];
		t = types.length;
		while ( t-- ) {
			tmp = rtypenamespace.exec( types[t] ) || [];
			type = origType = tmp[1];
			namespaces = ( tmp[2] || "" ).split( "." ).sort();

			// Unbind all events (on this namespace, if provided) for the element
			if ( !type ) {
				for ( type in events ) {
					jQuery.event.remove( elem, type + types[ t ], handler, selector, true );
				}
				continue;
			}

			special = jQuery.event.special[ type ] || {};
			type = ( selector ? special.delegateType : special.bindType ) || type;
			handlers = events[ type ] || [];
			tmp = tmp[2] && new RegExp( "(^|\\.)" + namespaces.join("\\.(?:.*\\.|)") + "(\\.|$)" );

			// Remove matching events
			origCount = j = handlers.length;
			while ( j-- ) {
				handleObj = handlers[ j ];

				if ( ( mappedTypes || origType === handleObj.origType ) &&
					( !handler || handler.guid === handleObj.guid ) &&
					( !tmp || tmp.test( handleObj.namespace ) ) &&
					( !selector || selector === handleObj.selector || selector === "**" && handleObj.selector ) ) {
					handlers.splice( j, 1 );

					if ( handleObj.selector ) {
						handlers.delegateCount--;
					}
					if ( special.remove ) {
						special.remove.call( elem, handleObj );
					}
				}
			}

			// Remove generic event handler if we removed something and no more handlers exist
			// (avoids potential for endless recursion during removal of special event handlers)
			if ( origCount && !handlers.length ) {
				if ( !special.teardown || special.teardown.call( elem, namespaces, elemData.handle ) === false ) {
					jQuery.removeEvent( elem, type, elemData.handle );
				}

				delete events[ type ];
			}
		}

		// Remove the expando if it's no longer used
		if ( jQuery.isEmptyObject( events ) ) {
			delete elemData.handle;
			data_priv.remove( elem, "events" );
		}
	},

	trigger: function( event, data, elem, onlyHandlers ) {

		var i, cur, tmp, bubbleType, ontype, handle, special,
			eventPath = [ elem || document ],
			type = hasOwn.call( event, "type" ) ? event.type : event,
			namespaces = hasOwn.call( event, "namespace" ) ? event.namespace.split(".") : [];

		cur = tmp = elem = elem || document;

		// Don't do events on text and comment nodes
		if ( elem.nodeType === 3 || elem.nodeType === 8 ) {
			return;
		}

		// focus/blur morphs to focusin/out; ensure we're not firing them right now
		if ( rfocusMorph.test( type + jQuery.event.triggered ) ) {
			return;
		}

		if ( type.indexOf(".") >= 0 ) {
			// Namespaced trigger; create a regexp to match event type in handle()
			namespaces = type.split(".");
			type = namespaces.shift();
			namespaces.sort();
		}
		ontype = type.indexOf(":") < 0 && "on" + type;

		// Caller can pass in a jQuery.Event object, Object, or just an event type string
		event = event[ jQuery.expando ] ?
			event :
			new jQuery.Event( type, typeof event === "object" && event );

		// Trigger bitmask: & 1 for native handlers; & 2 for jQuery (always true)
		event.isTrigger = onlyHandlers ? 2 : 3;
		event.namespace = namespaces.join(".");
		event.namespace_re = event.namespace ?
			new RegExp( "(^|\\.)" + namespaces.join("\\.(?:.*\\.|)") + "(\\.|$)" ) :
			null;

		// Clean up the event in case it is being reused
		event.result = undefined;
		if ( !event.target ) {
			event.target = elem;
		}

		// Clone any incoming data and prepend the event, creating the handler arg list
		data = data == null ?
			[ event ] :
			jQuery.makeArray( data, [ event ] );

		// Allow special events to draw outside the lines
		special = jQuery.event.special[ type ] || {};
		if ( !onlyHandlers && special.trigger && special.trigger.apply( elem, data ) === false ) {
			return;
		}

		// Determine event propagation path in advance, per W3C events spec (#9951)
		// Bubble up to document, then to window; watch for a global ownerDocument var (#9724)
		if ( !onlyHandlers && !special.noBubble && !jQuery.isWindow( elem ) ) {

			bubbleType = special.delegateType || type;
			if ( !rfocusMorph.test( bubbleType + type ) ) {
				cur = cur.parentNode;
			}
			for ( ; cur; cur = cur.parentNode ) {
				eventPath.push( cur );
				tmp = cur;
			}

			// Only add window if we got to document (e.g., not plain obj or detached DOM)
			if ( tmp === (elem.ownerDocument || document) ) {
				eventPath.push( tmp.defaultView || tmp.parentWindow || window );
			}
		}

		// Fire handlers on the event path
		i = 0;
		while ( (cur = eventPath[i++]) && !event.isPropagationStopped() ) {

			event.type = i > 1 ?
				bubbleType :
				special.bindType || type;

			// jQuery handler
			handle = ( data_priv.get( cur, "events" ) || {} )[ event.type ] && data_priv.get( cur, "handle" );
			if ( handle ) {
				handle.apply( cur, data );
			}

			// Native handler
			handle = ontype && cur[ ontype ];
			if ( handle && handle.apply && jQuery.acceptData( cur ) ) {
				event.result = handle.apply( cur, data );
				if ( event.result === false ) {
					event.preventDefault();
				}
			}
		}
		event.type = type;

		// If nobody prevented the default action, do it now
		if ( !onlyHandlers && !event.isDefaultPrevented() ) {

			if ( (!special._default || special._default.apply( eventPath.pop(), data ) === false) &&
				jQuery.acceptData( elem ) ) {

				// Call a native DOM method on the target with the same name name as the event.
				// Don't do default actions on window, that's where global variables be (#6170)
				if ( ontype && jQuery.isFunction( elem[ type ] ) && !jQuery.isWindow( elem ) ) {

					// Don't re-trigger an onFOO event when we call its FOO() method
					tmp = elem[ ontype ];

					if ( tmp ) {
						elem[ ontype ] = null;
					}

					// Prevent re-triggering of the same event, since we already bubbled it above
					jQuery.event.triggered = type;
					elem[ type ]();
					jQuery.event.triggered = undefined;

					if ( tmp ) {
						elem[ ontype ] = tmp;
					}
				}
			}
		}

		return event.result;
	},

	dispatch: function( event ) {

		// Make a writable jQuery.Event from the native event object
		event = jQuery.event.fix( event );

		var i, j, ret, matched, handleObj,
			handlerQueue = [],
			args = slice.call( arguments ),
			handlers = ( data_priv.get( this, "events" ) || {} )[ event.type ] || [],
			special = jQuery.event.special[ event.type ] || {};

		// Use the fix-ed jQuery.Event rather than the (read-only) native event
		args[0] = event;
		event.delegateTarget = this;

		// Call the preDispatch hook for the mapped type, and let it bail if desired
		if ( special.preDispatch && special.preDispatch.call( this, event ) === false ) {
			return;
		}

		// Determine handlers
		handlerQueue = jQuery.event.handlers.call( this, event, handlers );

		// Run delegates first; they may want to stop propagation beneath us
		i = 0;
		while ( (matched = handlerQueue[ i++ ]) && !event.isPropagationStopped() ) {
			event.currentTarget = matched.elem;

			j = 0;
			while ( (handleObj = matched.handlers[ j++ ]) && !event.isImmediatePropagationStopped() ) {

				// Triggered event must either 1) have no namespace, or
				// 2) have namespace(s) a subset or equal to those in the bound event (both can have no namespace).
				if ( !event.namespace_re || event.namespace_re.test( handleObj.namespace ) ) {

					event.handleObj = handleObj;
					event.data = handleObj.data;

					ret = ( (jQuery.event.special[ handleObj.origType ] || {}).handle || handleObj.handler )
							.apply( matched.elem, args );

					if ( ret !== undefined ) {
						if ( (event.result = ret) === false ) {
							event.preventDefault();
							event.stopPropagation();
						}
					}
				}
			}
		}

		// Call the postDispatch hook for the mapped type
		if ( special.postDispatch ) {
			special.postDispatch.call( this, event );
		}

		return event.result;
	},

	handlers: function( event, handlers ) {
		var i, matches, sel, handleObj,
			handlerQueue = [],
			delegateCount = handlers.delegateCount,
			cur = event.target;

		// Find delegate handlers
		// Black-hole SVG <use> instance trees (#13180)
		// Avoid non-left-click bubbling in Firefox (#3861)
		if ( delegateCount && cur.nodeType && (!event.button || event.type !== "click") ) {

			for ( ; cur !== this; cur = cur.parentNode || this ) {

				// Don't process clicks on disabled elements (#6911, #8165, #11382, #11764)
				if ( cur.disabled !== true || event.type !== "click" ) {
					matches = [];
					for ( i = 0; i < delegateCount; i++ ) {
						handleObj = handlers[ i ];

						// Don't conflict with Object.prototype properties (#13203)
						sel = handleObj.selector + " ";

						if ( matches[ sel ] === undefined ) {
							matches[ sel ] = handleObj.needsContext ?
								jQuery( sel, this ).index( cur ) >= 0 :
								jQuery.find( sel, this, null, [ cur ] ).length;
						}
						if ( matches[ sel ] ) {
							matches.push( handleObj );
						}
					}
					if ( matches.length ) {
						handlerQueue.push({ elem: cur, handlers: matches });
					}
				}
			}
		}

		// Add the remaining (directly-bound) handlers
		if ( delegateCount < handlers.length ) {
			handlerQueue.push({ elem: this, handlers: handlers.slice( delegateCount ) });
		}

		return handlerQueue;
	},

	// Includes some event props shared by KeyEvent and MouseEvent
	props: "altKey bubbles cancelable ctrlKey currentTarget eventPhase metaKey relatedTarget shiftKey target timeStamp view which".split(" "),

	fixHooks: {},

	keyHooks: {
		props: "char charCode key keyCode".split(" "),
		filter: function( event, original ) {

			// Add which for key events
			if ( event.which == null ) {
				event.which = original.charCode != null ? original.charCode : original.keyCode;
			}

			return event;
		}
	},

	mouseHooks: {
		props: "button buttons clientX clientY offsetX offsetY pageX pageY screenX screenY toElement".split(" "),
		filter: function( event, original ) {
			var eventDoc, doc, body,
				button = original.button;

			// Calculate pageX/Y if missing and clientX/Y available
			if ( event.pageX == null && original.clientX != null ) {
				eventDoc = event.target.ownerDocument || document;
				doc = eventDoc.documentElement;
				body = eventDoc.body;

				event.pageX = original.clientX + ( doc && doc.scrollLeft || body && body.scrollLeft || 0 ) - ( doc && doc.clientLeft || body && body.clientLeft || 0 );
				event.pageY = original.clientY + ( doc && doc.scrollTop  || body && body.scrollTop  || 0 ) - ( doc && doc.clientTop  || body && body.clientTop  || 0 );
			}

			// Add which for click: 1 === left; 2 === middle; 3 === right
			// Note: button is not normalized, so don't use it
			if ( !event.which && button !== undefined ) {
				event.which = ( button & 1 ? 1 : ( button & 2 ? 3 : ( button & 4 ? 2 : 0 ) ) );
			}

			return event;
		}
	},

	fix: function( event ) {
		if ( event[ jQuery.expando ] ) {
			return event;
		}

		// Create a writable copy of the event object and normalize some properties
		var i, prop, copy,
			type = event.type,
			originalEvent = event,
			fixHook = this.fixHooks[ type ];

		if ( !fixHook ) {
			this.fixHooks[ type ] = fixHook =
				rmouseEvent.test( type ) ? this.mouseHooks :
				rkeyEvent.test( type ) ? this.keyHooks :
				{};
		}
		copy = fixHook.props ? this.props.concat( fixHook.props ) : this.props;

		event = new jQuery.Event( originalEvent );

		i = copy.length;
		while ( i-- ) {
			prop = copy[ i ];
			event[ prop ] = originalEvent[ prop ];
		}

		// Support: Cordova 2.5 (WebKit) (#13255)
		// All events should have a target; Cordova deviceready doesn't
		if ( !event.target ) {
			event.target = document;
		}

		// Support: Safari 6.0+, Chrome < 28
		// Target should not be a text node (#504, #13143)
		if ( event.target.nodeType === 3 ) {
			event.target = event.target.parentNode;
		}

		return fixHook.filter ? fixHook.filter( event, originalEvent ) : event;
	},

	special: {
		load: {
			// Prevent triggered image.load events from bubbling to window.load
			noBubble: true
		},
		focus: {
			// Fire native event if possible so blur/focus sequence is correct
			trigger: function() {
				if ( this !== safeActiveElement() && this.focus ) {
					this.focus();
					return false;
				}
			},
			delegateType: "focusin"
		},
		blur: {
			trigger: function() {
				if ( this === safeActiveElement() && this.blur ) {
					this.blur();
					return false;
				}
			},
			delegateType: "focusout"
		},
		click: {
			// For checkbox, fire native event so checked state will be right
			trigger: function() {
				if ( this.type === "checkbox" && this.click && jQuery.nodeName( this, "input" ) ) {
					this.click();
					return false;
				}
			},

			// For cross-browser consistency, don't fire native .click() on links
			_default: function( event ) {
				return jQuery.nodeName( event.target, "a" );
			}
		},

		beforeunload: {
			postDispatch: function( event ) {

				// Support: Firefox 20+
				// Firefox doesn't alert if the returnValue field is not set.
				if ( event.result !== undefined && event.originalEvent ) {
					event.originalEvent.returnValue = event.result;
				}
			}
		}
	},

	simulate: function( type, elem, event, bubble ) {
		// Piggyback on a donor event to simulate a different one.
		// Fake originalEvent to avoid donor's stopPropagation, but if the
		// simulated event prevents default then we do the same on the donor.
		var e = jQuery.extend(
			new jQuery.Event(),
			event,
			{
				type: type,
				isSimulated: true,
				originalEvent: {}
			}
		);
		if ( bubble ) {
			jQuery.event.trigger( e, null, elem );
		} else {
			jQuery.event.dispatch.call( elem, e );
		}
		if ( e.isDefaultPrevented() ) {
			event.preventDefault();
		}
	}
};

jQuery.removeEvent = function( elem, type, handle ) {
	if ( elem.removeEventListener ) {
		elem.removeEventListener( type, handle, false );
	}
};

jQuery.Event = function( src, props ) {
	// Allow instantiation without the 'new' keyword
	if ( !(this instanceof jQuery.Event) ) {
		return new jQuery.Event( src, props );
	}

	// Event object
	if ( src && src.type ) {
		this.originalEvent = src;
		this.type = src.type;

		// Events bubbling up the document may have been marked as prevented
		// by a handler lower down the tree; reflect the correct value.
		this.isDefaultPrevented = src.defaultPrevented ||
				src.defaultPrevented === undefined &&
				// Support: Android < 4.0
				src.returnValue === false ?
			returnTrue :
			returnFalse;

	// Event type
	} else {
		this.type = src;
	}

	// Put explicitly provided properties onto the event object
	if ( props ) {
		jQuery.extend( this, props );
	}

	// Create a timestamp if incoming event doesn't have one
	this.timeStamp = src && src.timeStamp || jQuery.now();

	// Mark it as fixed
	this[ jQuery.expando ] = true;
};

// jQuery.Event is based on DOM3 Events as specified by the ECMAScript Language Binding
// http://www.w3.org/TR/2003/WD-DOM-Level-3-Events-20030331/ecma-script-binding.html
jQuery.Event.prototype = {
	isDefaultPrevented: returnFalse,
	isPropagationStopped: returnFalse,
	isImmediatePropagationStopped: returnFalse,

	preventDefault: function() {
		var e = this.originalEvent;

		this.isDefaultPrevented = returnTrue;

		if ( e && e.preventDefault ) {
			e.preventDefault();
		}
	},
	stopPropagation: function() {
		var e = this.originalEvent;

		this.isPropagationStopped = returnTrue;

		if ( e && e.stopPropagation ) {
			e.stopPropagation();
		}
	},
	stopImmediatePropagation: function() {
		var e = this.originalEvent;

		this.isImmediatePropagationStopped = returnTrue;

		if ( e && e.stopImmediatePropagation ) {
			e.stopImmediatePropagation();
		}

		this.stopPropagation();
	}
};

// Create mouseenter/leave events using mouseover/out and event-time checks
// Support: Chrome 15+
jQuery.each({
	mouseenter: "mouseover",
	mouseleave: "mouseout",
	pointerenter: "pointerover",
	pointerleave: "pointerout"
}, function( orig, fix ) {
	jQuery.event.special[ orig ] = {
		delegateType: fix,
		bindType: fix,

		handle: function( event ) {
			var ret,
				target = this,
				related = event.relatedTarget,
				handleObj = event.handleObj;

			// For mousenter/leave call the handler if related is outside the target.
			// NB: No relatedTarget if the mouse left/entered the browser window
			if ( !related || (related !== target && !jQuery.contains( target, related )) ) {
				event.type = handleObj.origType;
				ret = handleObj.handler.apply( this, arguments );
				event.type = fix;
			}
			return ret;
		}
	};
});

// Create "bubbling" focus and blur events
// Support: Firefox, Chrome, Safari
if ( !support.focusinBubbles ) {
	jQuery.each({ focus: "focusin", blur: "focusout" }, function( orig, fix ) {

		// Attach a single capturing handler on the document while someone wants focusin/focusout
		var handler = function( event ) {
				jQuery.event.simulate( fix, event.target, jQuery.event.fix( event ), true );
			};

		jQuery.event.special[ fix ] = {
			setup: function() {
				var doc = this.ownerDocument || this,
					attaches = data_priv.access( doc, fix );

				if ( !attaches ) {
					doc.addEventListener( orig, handler, true );
				}
				data_priv.access( doc, fix, ( attaches || 0 ) + 1 );
			},
			teardown: function() {
				var doc = this.ownerDocument || this,
					attaches = data_priv.access( doc, fix ) - 1;

				if ( !attaches ) {
					doc.removeEventListener( orig, handler, true );
					data_priv.remove( doc, fix );

				} else {
					data_priv.access( doc, fix, attaches );
				}
			}
		};
	});
}

jQuery.fn.extend({

	on: function( types, selector, data, fn, /*INTERNAL*/ one ) {
		var origFn, type;

		// Types can be a map of types/handlers
		if ( typeof types === "object" ) {
			// ( types-Object, selector, data )
			if ( typeof selector !== "string" ) {
				// ( types-Object, data )
				data = data || selector;
				selector = undefined;
			}
			for ( type in types ) {
				this.on( type, selector, data, types[ type ], one );
			}
			return this;
		}

		if ( data == null && fn == null ) {
			// ( types, fn )
			fn = selector;
			data = selector = undefined;
		} else if ( fn == null ) {
			if ( typeof selector === "string" ) {
				// ( types, selector, fn )
				fn = data;
				data = undefined;
			} else {
				// ( types, data, fn )
				fn = data;
				data = selector;
				selector = undefined;
			}
		}
		if ( fn === false ) {
			fn = returnFalse;
		} else if ( !fn ) {
			return this;
		}

		if ( one === 1 ) {
			origFn = fn;
			fn = function( event ) {
				// Can use an empty set, since event contains the info
				jQuery().off( event );
				return origFn.apply( this, arguments );
			};
			// Use same guid so caller can remove using origFn
			fn.guid = origFn.guid || ( origFn.guid = jQuery.guid++ );
		}
		return this.each( function() {
			jQuery.event.add( this, types, fn, data, selector );
		});
	},
	one: function( types, selector, data, fn ) {
		return this.on( types, selector, data, fn, 1 );
	},
	off: function( types, selector, fn ) {
		var handleObj, type;
		if ( types && types.preventDefault && types.handleObj ) {
			// ( event )  dispatched jQuery.Event
			handleObj = types.handleObj;
			jQuery( types.delegateTarget ).off(
				handleObj.namespace ? handleObj.origType + "." + handleObj.namespace : handleObj.origType,
				handleObj.selector,
				handleObj.handler
			);
			return this;
		}
		if ( typeof types === "object" ) {
			// ( types-object [, selector] )
			for ( type in types ) {
				this.off( type, selector, types[ type ] );
			}
			return this;
		}
		if ( selector === false || typeof selector === "function" ) {
			// ( types [, fn] )
			fn = selector;
			selector = undefined;
		}
		if ( fn === false ) {
			fn = returnFalse;
		}
		return this.each(function() {
			jQuery.event.remove( this, types, fn, selector );
		});
	},

	trigger: function( type, data ) {
		return this.each(function() {
			jQuery.event.trigger( type, data, this );
		});
	},
	triggerHandler: function( type, data ) {
		var elem = this[0];
		if ( elem ) {
			return jQuery.event.trigger( type, data, elem, true );
		}
	}
});


var
	rxhtmlTag = /<(?!area|br|col|embed|hr|img|input|link|meta|param)(([\w:]+)[^>]*)\/>/gi,
	rtagName = /<([\w:]+)/,
	rhtml = /<|&#?\w+;/,
	rnoInnerhtml = /<(?:script|style|link)/i,
	// checked="checked" or checked
	rchecked = /checked\s*(?:[^=]|=\s*.checked.)/i,
	rscriptType = /^$|\/(?:java|ecma)script/i,
	rscriptTypeMasked = /^true\/(.*)/,
	rcleanScript = /^\s*<!(?:\[CDATA\[|--)|(?:\]\]|--)>\s*$/g,

	// We have to close these tags to support XHTML (#13200)
	wrapMap = {

		// Support: IE 9
		option: [ 1, "<select multiple='multiple'>", "</select>" ],

		thead: [ 1, "<table>", "</table>" ],
		col: [ 2, "<table><colgroup>", "</colgroup></table>" ],
		tr: [ 2, "<table><tbody>", "</tbody></table>" ],
		td: [ 3, "<table><tbody><tr>", "</tr></tbody></table>" ],

		_default: [ 0, "", "" ]
	};

// Support: IE 9
wrapMap.optgroup = wrapMap.option;

wrapMap.tbody = wrapMap.tfoot = wrapMap.colgroup = wrapMap.caption = wrapMap.thead;
wrapMap.th = wrapMap.td;

// Support: 1.x compatibility
// Manipulating tables requires a tbody
function manipulationTarget( elem, content ) {
	return jQuery.nodeName( elem, "table" ) &&
		jQuery.nodeName( content.nodeType !== 11 ? content : content.firstChild, "tr" ) ?

		elem.getElementsByTagName("tbody")[0] ||
			elem.appendChild( elem.ownerDocument.createElement("tbody") ) :
		elem;
}

// Replace/restore the type attribute of script elements for safe DOM manipulation
function disableScript( elem ) {
	elem.type = (elem.getAttribute("type") !== null) + "/" + elem.type;
	return elem;
}
function restoreScript( elem ) {
	var match = rscriptTypeMasked.exec( elem.type );

	if ( match ) {
		elem.type = match[ 1 ];
	} else {
		elem.removeAttribute("type");
	}

	return elem;
}

// Mark scripts as having already been evaluated
function setGlobalEval( elems, refElements ) {
	var i = 0,
		l = elems.length;

	for ( ; i < l; i++ ) {
		data_priv.set(
			elems[ i ], "globalEval", !refElements || data_priv.get( refElements[ i ], "globalEval" )
		);
	}
}

function cloneCopyEvent( src, dest ) {
	var i, l, type, pdataOld, pdataCur, udataOld, udataCur, events;

	if ( dest.nodeType !== 1 ) {
		return;
	}

	// 1. Copy private data: events, handlers, etc.
	if ( data_priv.hasData( src ) ) {
		pdataOld = data_priv.access( src );
		pdataCur = data_priv.set( dest, pdataOld );
		events = pdataOld.events;

		if ( events ) {
			delete pdataCur.handle;
			pdataCur.events = {};

			for ( type in events ) {
				for ( i = 0, l = events[ type ].length; i < l; i++ ) {
					jQuery.event.add( dest, type, events[ type ][ i ] );
				}
			}
		}
	}

	// 2. Copy user data
	if ( data_user.hasData( src ) ) {
		udataOld = data_user.access( src );
		udataCur = jQuery.extend( {}, udataOld );

		data_user.set( dest, udataCur );
	}
}

function getAll( context, tag ) {
	var ret = context.getElementsByTagName ? context.getElementsByTagName( tag || "*" ) :
			context.querySelectorAll ? context.querySelectorAll( tag || "*" ) :
			[];

	return tag === undefined || tag && jQuery.nodeName( context, tag ) ?
		jQuery.merge( [ context ], ret ) :
		ret;
}

// Support: IE >= 9
function fixInput( src, dest ) {
	var nodeName = dest.nodeName.toLowerCase();

	// Fails to persist the checked state of a cloned checkbox or radio button.
	if ( nodeName === "input" && rcheckableType.test( src.type ) ) {
		dest.checked = src.checked;

	// Fails to return the selected option to the default selected state when cloning options
	} else if ( nodeName === "input" || nodeName === "textarea" ) {
		dest.defaultValue = src.defaultValue;
	}
}

jQuery.extend({
	clone: function( elem, dataAndEvents, deepDataAndEvents ) {
		var i, l, srcElements, destElements,
			clone = elem.cloneNode( true ),
			inPage = jQuery.contains( elem.ownerDocument, elem );

		// Support: IE >= 9
		// Fix Cloning issues
		if ( !support.noCloneChecked && ( elem.nodeType === 1 || elem.nodeType === 11 ) &&
				!jQuery.isXMLDoc( elem ) ) {

			// We eschew Sizzle here for performance reasons: http://jsperf.com/getall-vs-sizzle/2
			destElements = getAll( clone );
			srcElements = getAll( elem );

			for ( i = 0, l = srcElements.length; i < l; i++ ) {
				fixInput( srcElements[ i ], destElements[ i ] );
			}
		}

		// Copy the events from the original to the clone
		if ( dataAndEvents ) {
			if ( deepDataAndEvents ) {
				srcElements = srcElements || getAll( elem );
				destElements = destElements || getAll( clone );

				for ( i = 0, l = srcElements.length; i < l; i++ ) {
					cloneCopyEvent( srcElements[ i ], destElements[ i ] );
				}
			} else {
				cloneCopyEvent( elem, clone );
			}
		}

		// Preserve script evaluation history
		destElements = getAll( clone, "script" );
		if ( destElements.length > 0 ) {
			setGlobalEval( destElements, !inPage && getAll( elem, "script" ) );
		}

		// Return the cloned set
		return clone;
	},

	buildFragment: function( elems, context, scripts, selection ) {
		var elem, tmp, tag, wrap, contains, j,
			fragment = context.createDocumentFragment(),
			nodes = [],
			i = 0,
			l = elems.length;

		for ( ; i < l; i++ ) {
			elem = elems[ i ];

			if ( elem || elem === 0 ) {

				// Add nodes directly
				if ( jQuery.type( elem ) === "object" ) {
					// Support: QtWebKit
					// jQuery.merge because push.apply(_, arraylike) throws
					jQuery.merge( nodes, elem.nodeType ? [ elem ] : elem );

				// Convert non-html into a text node
				} else if ( !rhtml.test( elem ) ) {
					nodes.push( context.createTextNode( elem ) );

				// Convert html into DOM nodes
				} else {
					tmp = tmp || fragment.appendChild( context.createElement("div") );

					// Deserialize a standard representation
					tag = ( rtagName.exec( elem ) || [ "", "" ] )[ 1 ].toLowerCase();
					wrap = wrapMap[ tag ] || wrapMap._default;
					tmp.innerHTML = wrap[ 1 ] + elem.replace( rxhtmlTag, "<$1></$2>" ) + wrap[ 2 ];

					// Descend through wrappers to the right content
					j = wrap[ 0 ];
					while ( j-- ) {
						tmp = tmp.lastChild;
					}

					// Support: QtWebKit
					// jQuery.merge because push.apply(_, arraylike) throws
					jQuery.merge( nodes, tmp.childNodes );

					// Remember the top-level container
					tmp = fragment.firstChild;

					// Fixes #12346
					// Support: Webkit, IE
					tmp.textContent = "";
				}
			}
		}

		// Remove wrapper from fragment
		fragment.textContent = "";

		i = 0;
		while ( (elem = nodes[ i++ ]) ) {

			// #4087 - If origin and destination elements are the same, and this is
			// that element, do not do anything
			if ( selection && jQuery.inArray( elem, selection ) !== -1 ) {
				continue;
			}

			contains = jQuery.contains( elem.ownerDocument, elem );

			// Append to fragment
			tmp = getAll( fragment.appendChild( elem ), "script" );

			// Preserve script evaluation history
			if ( contains ) {
				setGlobalEval( tmp );
			}

			// Capture executables
			if ( scripts ) {
				j = 0;
				while ( (elem = tmp[ j++ ]) ) {
					if ( rscriptType.test( elem.type || "" ) ) {
						scripts.push( elem );
					}
				}
			}
		}

		return fragment;
	},

	cleanData: function( elems ) {
		var data, elem, type, key,
			special = jQuery.event.special,
			i = 0;

		for ( ; (elem = elems[ i ]) !== undefined; i++ ) {
			if ( jQuery.acceptData( elem ) ) {
				key = elem[ data_priv.expando ];

				if ( key && (data = data_priv.cache[ key ]) ) {
					if ( data.events ) {
						for ( type in data.events ) {
							if ( special[ type ] ) {
								jQuery.event.remove( elem, type );

							// This is a shortcut to avoid jQuery.event.remove's overhead
							} else {
								jQuery.removeEvent( elem, type, data.handle );
							}
						}
					}
					if ( data_priv.cache[ key ] ) {
						// Discard any remaining `private` data
						delete data_priv.cache[ key ];
					}
				}
			}
			// Discard any remaining `user` data
			delete data_user.cache[ elem[ data_user.expando ] ];
		}
	}
});

jQuery.fn.extend({
	text: function( value ) {
		return access( this, function( value ) {
			return value === undefined ?
				jQuery.text( this ) :
				this.empty().each(function() {
					if ( this.nodeType === 1 || this.nodeType === 11 || this.nodeType === 9 ) {
						this.textContent = value;
					}
				});
		}, null, value, arguments.length );
	},

	append: function() {
		return this.domManip( arguments, function( elem ) {
			if ( this.nodeType === 1 || this.nodeType === 11 || this.nodeType === 9 ) {
				var target = manipulationTarget( this, elem );
				target.appendChild( elem );
			}
		});
	},

	prepend: function() {
		return this.domManip( arguments, function( elem ) {
			if ( this.nodeType === 1 || this.nodeType === 11 || this.nodeType === 9 ) {
				var target = manipulationTarget( this, elem );
				target.insertBefore( elem, target.firstChild );
			}
		});
	},

	before: function() {
		return this.domManip( arguments, function( elem ) {
			if ( this.parentNode ) {
				this.parentNode.insertBefore( elem, this );
			}
		});
	},

	after: function() {
		return this.domManip( arguments, function( elem ) {
			if ( this.parentNode ) {
				this.parentNode.insertBefore( elem, this.nextSibling );
			}
		});
	},

	remove: function( selector, keepData /* Internal Use Only */ ) {
		var elem,
			elems = selector ? jQuery.filter( selector, this ) : this,
			i = 0;

		for ( ; (elem = elems[i]) != null; i++ ) {
			if ( !keepData && elem.nodeType === 1 ) {
				jQuery.cleanData( getAll( elem ) );
			}

			if ( elem.parentNode ) {
				if ( keepData && jQuery.contains( elem.ownerDocument, elem ) ) {
					setGlobalEval( getAll( elem, "script" ) );
				}
				elem.parentNode.removeChild( elem );
			}
		}

		return this;
	},

	empty: function() {
		var elem,
			i = 0;

		for ( ; (elem = this[i]) != null; i++ ) {
			if ( elem.nodeType === 1 ) {

				// Prevent memory leaks
				jQuery.cleanData( getAll( elem, false ) );

				// Remove any remaining nodes
				elem.textContent = "";
			}
		}

		return this;
	},

	clone: function( dataAndEvents, deepDataAndEvents ) {
		dataAndEvents = dataAndEvents == null ? false : dataAndEvents;
		deepDataAndEvents = deepDataAndEvents == null ? dataAndEvents : deepDataAndEvents;

		return this.map(function() {
			return jQuery.clone( this, dataAndEvents, deepDataAndEvents );
		});
	},

	html: function( value ) {
		return access( this, function( value ) {
			var elem = this[ 0 ] || {},
				i = 0,
				l = this.length;

			if ( value === undefined && elem.nodeType === 1 ) {
				return elem.innerHTML;
			}

			// See if we can take a shortcut and just use innerHTML
			if ( typeof value === "string" && !rnoInnerhtml.test( value ) &&
				!wrapMap[ ( rtagName.exec( value ) || [ "", "" ] )[ 1 ].toLowerCase() ] ) {

				value = value.replace( rxhtmlTag, "<$1></$2>" );

				try {
					for ( ; i < l; i++ ) {
						elem = this[ i ] || {};

						// Remove element nodes and prevent memory leaks
						if ( elem.nodeType === 1 ) {
							jQuery.cleanData( getAll( elem, false ) );
							elem.innerHTML = value;
						}
					}

					elem = 0;

				// If using innerHTML throws an exception, use the fallback method
				} catch( e ) {}
			}

			if ( elem ) {
				this.empty().append( value );
			}
		}, null, value, arguments.length );
	},

	replaceWith: function() {
		var arg = arguments[ 0 ];

		// Make the changes, replacing each context element with the new content
		this.domManip( arguments, function( elem ) {
			arg = this.parentNode;

			jQuery.cleanData( getAll( this ) );

			if ( arg ) {
				arg.replaceChild( elem, this );
			}
		});

		// Force removal if there was no new content (e.g., from empty arguments)
		return arg && (arg.length || arg.nodeType) ? this : this.remove();
	},

	detach: function( selector ) {
		return this.remove( selector, true );
	},

	domManip: function( args, callback ) {

		// Flatten any nested arrays
		args = concat.apply( [], args );

		var fragment, first, scripts, hasScripts, node, doc,
			i = 0,
			l = this.length,
			set = this,
			iNoClone = l - 1,
			value = args[ 0 ],
			isFunction = jQuery.isFunction( value );

		// We can't cloneNode fragments that contain checked, in WebKit
		if ( isFunction ||
				( l > 1 && typeof value === "string" &&
					!support.checkClone && rchecked.test( value ) ) ) {
			return this.each(function( index ) {
				var self = set.eq( index );
				if ( isFunction ) {
					args[ 0 ] = value.call( this, index, self.html() );
				}
				self.domManip( args, callback );
			});
		}

		if ( l ) {
			fragment = jQuery.buildFragment( args, this[ 0 ].ownerDocument, false, this );
			first = fragment.firstChild;

			if ( fragment.childNodes.length === 1 ) {
				fragment = first;
			}

			if ( first ) {
				scripts = jQuery.map( getAll( fragment, "script" ), disableScript );
				hasScripts = scripts.length;

				// Use the original fragment for the last item instead of the first because it can end up
				// being emptied incorrectly in certain situations (#8070).
				for ( ; i < l; i++ ) {
					node = fragment;

					if ( i !== iNoClone ) {
						node = jQuery.clone( node, true, true );

						// Keep references to cloned scripts for later restoration
						if ( hasScripts ) {
							// Support: QtWebKit
							// jQuery.merge because push.apply(_, arraylike) throws
							jQuery.merge( scripts, getAll( node, "script" ) );
						}
					}

					callback.call( this[ i ], node, i );
				}

				if ( hasScripts ) {
					doc = scripts[ scripts.length - 1 ].ownerDocument;

					// Reenable scripts
					jQuery.map( scripts, restoreScript );

					// Evaluate executable scripts on first document insertion
					for ( i = 0; i < hasScripts; i++ ) {
						node = scripts[ i ];
						if ( rscriptType.test( node.type || "" ) &&
							!data_priv.access( node, "globalEval" ) && jQuery.contains( doc, node ) ) {

							if ( node.src ) {
								// Optional AJAX dependency, but won't run scripts if not present
								if ( jQuery._evalUrl ) {
									jQuery._evalUrl( node.src );
								}
							} else {
								jQuery.globalEval( node.textContent.replace( rcleanScript, "" ) );
							}
						}
					}
				}
			}
		}

		return this;
	}
});

jQuery.each({
	appendTo: "append",
	prependTo: "prepend",
	insertBefore: "before",
	insertAfter: "after",
	replaceAll: "replaceWith"
}, function( name, original ) {
	jQuery.fn[ name ] = function( selector ) {
		var elems,
			ret = [],
			insert = jQuery( selector ),
			last = insert.length - 1,
			i = 0;

		for ( ; i <= last; i++ ) {
			elems = i === last ? this : this.clone( true );
			jQuery( insert[ i ] )[ original ]( elems );

			// Support: QtWebKit
			// .get() because push.apply(_, arraylike) throws
			push.apply( ret, elems.get() );
		}

		return this.pushStack( ret );
	};
});


var iframe,
	elemdisplay = {};

/**
 * Retrieve the actual display of a element
 * @param {String} name nodeName of the element
 * @param {Object} doc Document object
 */
// Called only from within defaultDisplay
function actualDisplay( name, doc ) {
	var style,
		elem = jQuery( doc.createElement( name ) ).appendTo( doc.body ),

		// getDefaultComputedStyle might be reliably used only on attached element
		display = window.getDefaultComputedStyle && ( style = window.getDefaultComputedStyle( elem[ 0 ] ) ) ?

			// Use of this method is a temporary fix (more like optmization) until something better comes along,
			// since it was removed from specification and supported only in FF
			style.display : jQuery.css( elem[ 0 ], "display" );

	// We don't have any data stored on the element,
	// so use "detach" method as fast way to get rid of the element
	elem.detach();

	return display;
}

/**
 * Try to determine the default display value of an element
 * @param {String} nodeName
 */
function defaultDisplay( nodeName ) {
	var doc = document,
		display = elemdisplay[ nodeName ];

	if ( !display ) {
		display = actualDisplay( nodeName, doc );

		// If the simple way fails, read from inside an iframe
		if ( display === "none" || !display ) {

			// Use the already-created iframe if possible
			iframe = (iframe || jQuery( "<iframe frameborder='0' width='0' height='0'/>" )).appendTo( doc.documentElement );

			// Always write a new HTML skeleton so Webkit and Firefox don't choke on reuse
			doc = iframe[ 0 ].contentDocument;

			// Support: IE
			doc.write();
			doc.close();

			display = actualDisplay( nodeName, doc );
			iframe.detach();
		}

		// Store the correct default display
		elemdisplay[ nodeName ] = display;
	}

	return display;
}
var rmargin = (/^margin/);

var rnumnonpx = new RegExp( "^(" + pnum + ")(?!px)[a-z%]+$", "i" );

var getStyles = function( elem ) {
		return elem.ownerDocument.defaultView.getComputedStyle( elem, null );
	};



function curCSS( elem, name, computed ) {
	var width, minWidth, maxWidth, ret,
		style = elem.style;

	computed = computed || getStyles( elem );

	// Support: IE9
	// getPropertyValue is only needed for .css('filter') in IE9, see #12537
	if ( computed ) {
		ret = computed.getPropertyValue( name ) || computed[ name ];
	}

	if ( computed ) {

		if ( ret === "" && !jQuery.contains( elem.ownerDocument, elem ) ) {
			ret = jQuery.style( elem, name );
		}

		// Support: iOS < 6
		// A tribute to the "awesome hack by Dean Edwards"
		// iOS < 6 (at least) returns percentage for a larger set of values, but width seems to be reliably pixels
		// this is against the CSSOM draft spec: http://dev.w3.org/csswg/cssom/#resolved-values
		if ( rnumnonpx.test( ret ) && rmargin.test( name ) ) {

			// Remember the original values
			width = style.width;
			minWidth = style.minWidth;
			maxWidth = style.maxWidth;

			// Put in the new values to get a computed value out
			style.minWidth = style.maxWidth = style.width = ret;
			ret = computed.width;

			// Revert the changed values
			style.width = width;
			style.minWidth = minWidth;
			style.maxWidth = maxWidth;
		}
	}

	return ret !== undefined ?
		// Support: IE
		// IE returns zIndex value as an integer.
		ret + "" :
		ret;
}


function addGetHookIf( conditionFn, hookFn ) {
	// Define the hook, we'll check on the first run if it's really needed.
	return {
		get: function() {
			if ( conditionFn() ) {
				// Hook not needed (or it's not possible to use it due to missing dependency),
				// remove it.
				// Since there are no other hooks for marginRight, remove the whole object.
				delete this.get;
				return;
			}

			// Hook needed; redefine it so that the support test is not executed again.

			return (this.get = hookFn).apply( this, arguments );
		}
	};
}


(function() {
	var pixelPositionVal, boxSizingReliableVal,
		docElem = document.documentElement,
		container = document.createElement( "div" ),
		div = document.createElement( "div" );

	if ( !div.style ) {
		return;
	}

	div.style.backgroundClip = "content-box";
	div.cloneNode( true ).style.backgroundClip = "";
	support.clearCloneStyle = div.style.backgroundClip === "content-box";

	container.style.cssText = "border:0;width:0;height:0;top:0;left:-9999px;margin-top:1px;" +
		"position:absolute";
	container.appendChild( div );

	// Executing both pixelPosition & boxSizingReliable tests require only one layout
	// so they're executed at the same time to save the second computation.
	function computePixelPositionAndBoxSizingReliable() {
		div.style.cssText =
			// Support: Firefox<29, Android 2.3
			// Vendor-prefix box-sizing
			"-webkit-box-sizing:border-box;-moz-box-sizing:border-box;" +
			"box-sizing:border-box;display:block;margin-top:1%;top:1%;" +
			"border:1px;padding:1px;width:4px;position:absolute";
		div.innerHTML = "";
		docElem.appendChild( container );

		var divStyle = window.getComputedStyle( div, null );
		pixelPositionVal = divStyle.top !== "1%";
		boxSizingReliableVal = divStyle.width === "4px";

		docElem.removeChild( container );
	}

	// Support: node.js jsdom
	// Don't assume that getComputedStyle is a property of the global object
	if ( window.getComputedStyle ) {
		jQuery.extend( support, {
			pixelPosition: function() {
				// This test is executed only once but we still do memoizing
				// since we can use the boxSizingReliable pre-computing.
				// No need to check if the test was already performed, though.
				computePixelPositionAndBoxSizingReliable();
				return pixelPositionVal;
			},
			boxSizingReliable: function() {
				if ( boxSizingReliableVal == null ) {
					computePixelPositionAndBoxSizingReliable();
				}
				return boxSizingReliableVal;
			},
			reliableMarginRight: function() {
				// Support: Android 2.3
				// Check if div with explicit width and no margin-right incorrectly
				// gets computed margin-right based on width of container. (#3333)
				// WebKit Bug 13343 - getComputedStyle returns wrong value for margin-right
				// This support function is only executed once so no memoizing is needed.
				var ret,
					marginDiv = div.appendChild( document.createElement( "div" ) );

				// Reset CSS: box-sizing; display; margin; border; padding
				marginDiv.style.cssText = div.style.cssText =
					// Support: Firefox<29, Android 2.3
					// Vendor-prefix box-sizing
					"-webkit-box-sizing:content-box;-moz-box-sizing:content-box;" +
					"box-sizing:content-box;display:block;margin:0;border:0;padding:0";
				marginDiv.style.marginRight = marginDiv.style.width = "0";
				div.style.width = "1px";
				docElem.appendChild( container );

				ret = !parseFloat( window.getComputedStyle( marginDiv, null ).marginRight );

				docElem.removeChild( container );

				return ret;
			}
		});
	}
})();


// A method for quickly swapping in/out CSS properties to get correct calculations.
jQuery.swap = function( elem, options, callback, args ) {
	var ret, name,
		old = {};

	// Remember the old values, and insert the new ones
	for ( name in options ) {
		old[ name ] = elem.style[ name ];
		elem.style[ name ] = options[ name ];
	}

	ret = callback.apply( elem, args || [] );

	// Revert the old values
	for ( name in options ) {
		elem.style[ name ] = old[ name ];
	}

	return ret;
};


var
	// swappable if display is none or starts with table except "table", "table-cell", or "table-caption"
	// see here for display values: https://developer.mozilla.org/en-US/docs/CSS/display
	rdisplayswap = /^(none|table(?!-c[ea]).+)/,
	rnumsplit = new RegExp( "^(" + pnum + ")(.*)$", "i" ),
	rrelNum = new RegExp( "^([+-])=(" + pnum + ")", "i" ),

	cssShow = { position: "absolute", visibility: "hidden", display: "block" },
	cssNormalTransform = {
		letterSpacing: "0",
		fontWeight: "400"
	},

	cssPrefixes = [ "Webkit", "O", "Moz", "ms" ];

// return a css property mapped to a potentially vendor prefixed property
function vendorPropName( style, name ) {

	// shortcut for names that are not vendor prefixed
	if ( name in style ) {
		return name;
	}

	// check for vendor prefixed names
	var capName = name[0].toUpperCase() + name.slice(1),
		origName = name,
		i = cssPrefixes.length;

	while ( i-- ) {
		name = cssPrefixes[ i ] + capName;
		if ( name in style ) {
			return name;
		}
	}

	return origName;
}

function setPositiveNumber( elem, value, subtract ) {
	var matches = rnumsplit.exec( value );
	return matches ?
		// Guard against undefined "subtract", e.g., when used as in cssHooks
		Math.max( 0, matches[ 1 ] - ( subtract || 0 ) ) + ( matches[ 2 ] || "px" ) :
		value;
}

function augmentWidthOrHeight( elem, name, extra, isBorderBox, styles ) {
	var i = extra === ( isBorderBox ? "border" : "content" ) ?
		// If we already have the right measurement, avoid augmentation
		4 :
		// Otherwise initialize for horizontal or vertical properties
		name === "width" ? 1 : 0,

		val = 0;

	for ( ; i < 4; i += 2 ) {
		// both box models exclude margin, so add it if we want it
		if ( extra === "margin" ) {
			val += jQuery.css( elem, extra + cssExpand[ i ], true, styles );
		}

		if ( isBorderBox ) {
			// border-box includes padding, so remove it if we want content
			if ( extra === "content" ) {
				val -= jQuery.css( elem, "padding" + cssExpand[ i ], true, styles );
			}

			// at this point, extra isn't border nor margin, so remove border
			if ( extra !== "margin" ) {
				val -= jQuery.css( elem, "border" + cssExpand[ i ] + "Width", true, styles );
			}
		} else {
			// at this point, extra isn't content, so add padding
			val += jQuery.css( elem, "padding" + cssExpand[ i ], true, styles );

			// at this point, extra isn't content nor padding, so add border
			if ( extra !== "padding" ) {
				val += jQuery.css( elem, "border" + cssExpand[ i ] + "Width", true, styles );
			}
		}
	}

	return val;
}

function getWidthOrHeight( elem, name, extra ) {

	// Start with offset property, which is equivalent to the border-box value
	var valueIsBorderBox = true,
		val = name === "width" ? elem.offsetWidth : elem.offsetHeight,
		styles = getStyles( elem ),
		isBorderBox = jQuery.css( elem, "boxSizing", false, styles ) === "border-box";

	// some non-html elements return undefined for offsetWidth, so check for null/undefined
	// svg - https://bugzilla.mozilla.org/show_bug.cgi?id=649285
	// MathML - https://bugzilla.mozilla.org/show_bug.cgi?id=491668
	if ( val <= 0 || val == null ) {
		// Fall back to computed then uncomputed css if necessary
		val = curCSS( elem, name, styles );
		if ( val < 0 || val == null ) {
			val = elem.style[ name ];
		}

		// Computed unit is not pixels. Stop here and return.
		if ( rnumnonpx.test(val) ) {
			return val;
		}

		// we need the check for style in case a browser which returns unreliable values
		// for getComputedStyle silently falls back to the reliable elem.style
		valueIsBorderBox = isBorderBox &&
			( support.boxSizingReliable() || val === elem.style[ name ] );

		// Normalize "", auto, and prepare for extra
		val = parseFloat( val ) || 0;
	}

	// use the active box-sizing model to add/subtract irrelevant styles
	return ( val +
		augmentWidthOrHeight(
			elem,
			name,
			extra || ( isBorderBox ? "border" : "content" ),
			valueIsBorderBox,
			styles
		)
	) + "px";
}

function showHide( elements, show ) {
	var display, elem, hidden,
		values = [],
		index = 0,
		length = elements.length;

	for ( ; index < length; index++ ) {
		elem = elements[ index ];
		if ( !elem.style ) {
			continue;
		}

		values[ index ] = data_priv.get( elem, "olddisplay" );
		display = elem.style.display;
		if ( show ) {
			// Reset the inline display of this element to learn if it is
			// being hidden by cascaded rules or not
			if ( !values[ index ] && display === "none" ) {
				elem.style.display = "";
			}

			// Set elements which have been overridden with display: none
			// in a stylesheet to whatever the default browser style is
			// for such an element
			if ( elem.style.display === "" && isHidden( elem ) ) {
				values[ index ] = data_priv.access( elem, "olddisplay", defaultDisplay(elem.nodeName) );
			}
		} else {
			hidden = isHidden( elem );

			if ( display !== "none" || !hidden ) {
				data_priv.set( elem, "olddisplay", hidden ? display : jQuery.css( elem, "display" ) );
			}
		}
	}

	// Set the display of most of the elements in a second loop
	// to avoid the constant reflow
	for ( index = 0; index < length; index++ ) {
		elem = elements[ index ];
		if ( !elem.style ) {
			continue;
		}
		if ( !show || elem.style.display === "none" || elem.style.display === "" ) {
			elem.style.display = show ? values[ index ] || "" : "none";
		}
	}

	return elements;
}

jQuery.extend({
	// Add in style property hooks for overriding the default
	// behavior of getting and setting a style property
	cssHooks: {
		opacity: {
			get: function( elem, computed ) {
				if ( computed ) {
					// We should always get a number back from opacity
					var ret = curCSS( elem, "opacity" );
					return ret === "" ? "1" : ret;
				}
			}
		}
	},

	// Don't automatically add "px" to these possibly-unitless properties
	cssNumber: {
		"columnCount": true,
		"fillOpacity": true,
		"flexGrow": true,
		"flexShrink": true,
		"fontWeight": true,
		"lineHeight": true,
		"opacity": true,
		"order": true,
		"orphans": true,
		"widows": true,
		"zIndex": true,
		"zoom": true
	},

	// Add in properties whose names you wish to fix before
	// setting or getting the value
	cssProps: {
		// normalize float css property
		"float": "cssFloat"
	},

	// Get and set the style property on a DOM Node
	style: function( elem, name, value, extra ) {
		// Don't set styles on text and comment nodes
		if ( !elem || elem.nodeType === 3 || elem.nodeType === 8 || !elem.style ) {
			return;
		}

		// Make sure that we're working with the right name
		var ret, type, hooks,
			origName = jQuery.camelCase( name ),
			style = elem.style;

		name = jQuery.cssProps[ origName ] || ( jQuery.cssProps[ origName ] = vendorPropName( style, origName ) );

		// gets hook for the prefixed version
		// followed by the unprefixed version
		hooks = jQuery.cssHooks[ name ] || jQuery.cssHooks[ origName ];

		// Check if we're setting a value
		if ( value !== undefined ) {
			type = typeof value;

			// convert relative number strings (+= or -=) to relative numbers. #7345
			if ( type === "string" && (ret = rrelNum.exec( value )) ) {
				value = ( ret[1] + 1 ) * ret[2] + parseFloat( jQuery.css( elem, name ) );
				// Fixes bug #9237
				type = "number";
			}

			// Make sure that null and NaN values aren't set. See: #7116
			if ( value == null || value !== value ) {
				return;
			}

			// If a number was passed in, add 'px' to the (except for certain CSS properties)
			if ( type === "number" && !jQuery.cssNumber[ origName ] ) {
				value += "px";
			}

			// Fixes #8908, it can be done more correctly by specifying setters in cssHooks,
			// but it would mean to define eight (for every problematic property) identical functions
			if ( !support.clearCloneStyle && value === "" && name.indexOf( "background" ) === 0 ) {
				style[ name ] = "inherit";
			}

			// If a hook was provided, use that value, otherwise just set the specified value
			if ( !hooks || !("set" in hooks) || (value = hooks.set( elem, value, extra )) !== undefined ) {
				style[ name ] = value;
			}

		} else {
			// If a hook was provided get the non-computed value from there
			if ( hooks && "get" in hooks && (ret = hooks.get( elem, false, extra )) !== undefined ) {
				return ret;
			}

			// Otherwise just get the value from the style object
			return style[ name ];
		}
	},

	css: function( elem, name, extra, styles ) {
		var val, num, hooks,
			origName = jQuery.camelCase( name );

		// Make sure that we're working with the right name
		name = jQuery.cssProps[ origName ] || ( jQuery.cssProps[ origName ] = vendorPropName( elem.style, origName ) );

		// gets hook for the prefixed version
		// followed by the unprefixed version
		hooks = jQuery.cssHooks[ name ] || jQuery.cssHooks[ origName ];

		// If a hook was provided get the computed value from there
		if ( hooks && "get" in hooks ) {
			val = hooks.get( elem, true, extra );
		}

		// Otherwise, if a way to get the computed value exists, use that
		if ( val === undefined ) {
			val = curCSS( elem, name, styles );
		}

		//convert "normal" to computed value
		if ( val === "normal" && name in cssNormalTransform ) {
			val = cssNormalTransform[ name ];
		}

		// Return, converting to number if forced or a qualifier was provided and val looks numeric
		if ( extra === "" || extra ) {
			num = parseFloat( val );
			return extra === true || jQuery.isNumeric( num ) ? num || 0 : val;
		}
		return val;
	}
});

jQuery.each([ "height", "width" ], function( i, name ) {
	jQuery.cssHooks[ name ] = {
		get: function( elem, computed, extra ) {
			if ( computed ) {
				// certain elements can have dimension info if we invisibly show them
				// however, it must have a current display style that would benefit from this
				return rdisplayswap.test( jQuery.css( elem, "display" ) ) && elem.offsetWidth === 0 ?
					jQuery.swap( elem, cssShow, function() {
						return getWidthOrHeight( elem, name, extra );
					}) :
					getWidthOrHeight( elem, name, extra );
			}
		},

		set: function( elem, value, extra ) {
			var styles = extra && getStyles( elem );
			return setPositiveNumber( elem, value, extra ?
				augmentWidthOrHeight(
					elem,
					name,
					extra,
					jQuery.css( elem, "boxSizing", false, styles ) === "border-box",
					styles
				) : 0
			);
		}
	};
});

// Support: Android 2.3
jQuery.cssHooks.marginRight = addGetHookIf( support.reliableMarginRight,
	function( elem, computed ) {
		if ( computed ) {
			// WebKit Bug 13343 - getComputedStyle returns wrong value for margin-right
			// Work around by temporarily setting element display to inline-block
			return jQuery.swap( elem, { "display": "inline-block" },
				curCSS, [ elem, "marginRight" ] );
		}
	}
);

// These hooks are used by animate to expand properties
jQuery.each({
	margin: "",
	padding: "",
	border: "Width"
}, function( prefix, suffix ) {
	jQuery.cssHooks[ prefix + suffix ] = {
		expand: function( value ) {
			var i = 0,
				expanded = {},

				// assumes a single number if not a string
				parts = typeof value === "string" ? value.split(" ") : [ value ];

			for ( ; i < 4; i++ ) {
				expanded[ prefix + cssExpand[ i ] + suffix ] =
					parts[ i ] || parts[ i - 2 ] || parts[ 0 ];
			}

			return expanded;
		}
	};

	if ( !rmargin.test( prefix ) ) {
		jQuery.cssHooks[ prefix + suffix ].set = setPositiveNumber;
	}
});

jQuery.fn.extend({
	css: function( name, value ) {
		return access( this, function( elem, name, value ) {
			var styles, len,
				map = {},
				i = 0;

			if ( jQuery.isArray( name ) ) {
				styles = getStyles( elem );
				len = name.length;

				for ( ; i < len; i++ ) {
					map[ name[ i ] ] = jQuery.css( elem, name[ i ], false, styles );
				}

				return map;
			}

			return value !== undefined ?
				jQuery.style( elem, name, value ) :
				jQuery.css( elem, name );
		}, name, value, arguments.length > 1 );
	},
	show: function() {
		return showHide( this, true );
	},
	hide: function() {
		return showHide( this );
	},
	toggle: function( state ) {
		if ( typeof state === "boolean" ) {
			return state ? this.show() : this.hide();
		}

		return this.each(function() {
			if ( isHidden( this ) ) {
				jQuery( this ).show();
			} else {
				jQuery( this ).hide();
			}
		});
	}
});


function Tween( elem, options, prop, end, easing ) {
	return new Tween.prototype.init( elem, options, prop, end, easing );
}
jQuery.Tween = Tween;

Tween.prototype = {
	constructor: Tween,
	init: function( elem, options, prop, end, easing, unit ) {
		this.elem = elem;
		this.prop = prop;
		this.easing = easing || "swing";
		this.options = options;
		this.start = this.now = this.cur();
		this.end = end;
		this.unit = unit || ( jQuery.cssNumber[ prop ] ? "" : "px" );
	},
	cur: function() {
		var hooks = Tween.propHooks[ this.prop ];

		return hooks && hooks.get ?
			hooks.get( this ) :
			Tween.propHooks._default.get( this );
	},
	run: function( percent ) {
		var eased,
			hooks = Tween.propHooks[ this.prop ];

		if ( this.options.duration ) {
			this.pos = eased = jQuery.easing[ this.easing ](
				percent, this.options.duration * percent, 0, 1, this.options.duration
			);
		} else {
			this.pos = eased = percent;
		}
		this.now = ( this.end - this.start ) * eased + this.start;

		if ( this.options.step ) {
			this.options.step.call( this.elem, this.now, this );
		}

		if ( hooks && hooks.set ) {
			hooks.set( this );
		} else {
			Tween.propHooks._default.set( this );
		}
		return this;
	}
};

Tween.prototype.init.prototype = Tween.prototype;

Tween.propHooks = {
	_default: {
		get: function( tween ) {
			var result;

			if ( tween.elem[ tween.prop ] != null &&
				(!tween.elem.style || tween.elem.style[ tween.prop ] == null) ) {
				return tween.elem[ tween.prop ];
			}

			// passing an empty string as a 3rd parameter to .css will automatically
			// attempt a parseFloat and fallback to a string if the parse fails
			// so, simple values such as "10px" are parsed to Float.
			// complex values such as "rotate(1rad)" are returned as is.
			result = jQuery.css( tween.elem, tween.prop, "" );
			// Empty strings, null, undefined and "auto" are converted to 0.
			return !result || result === "auto" ? 0 : result;
		},
		set: function( tween ) {
			// use step hook for back compat - use cssHook if its there - use .style if its
			// available and use plain properties where available
			if ( jQuery.fx.step[ tween.prop ] ) {
				jQuery.fx.step[ tween.prop ]( tween );
			} else if ( tween.elem.style && ( tween.elem.style[ jQuery.cssProps[ tween.prop ] ] != null || jQuery.cssHooks[ tween.prop ] ) ) {
				jQuery.style( tween.elem, tween.prop, tween.now + tween.unit );
			} else {
				tween.elem[ tween.prop ] = tween.now;
			}
		}
	}
};

// Support: IE9
// Panic based approach to setting things on disconnected nodes

Tween.propHooks.scrollTop = Tween.propHooks.scrollLeft = {
	set: function( tween ) {
		if ( tween.elem.nodeType && tween.elem.parentNode ) {
			tween.elem[ tween.prop ] = tween.now;
		}
	}
};

jQuery.easing = {
	linear: function( p ) {
		return p;
	},
	swing: function( p ) {
		return 0.5 - Math.cos( p * Math.PI ) / 2;
	}
};

jQuery.fx = Tween.prototype.init;

// Back Compat <1.8 extension point
jQuery.fx.step = {};




var
	fxNow, timerId,
	rfxtypes = /^(?:toggle|show|hide)$/,
	rfxnum = new RegExp( "^(?:([+-])=|)(" + pnum + ")([a-z%]*)$", "i" ),
	rrun = /queueHooks$/,
	animationPrefilters = [ defaultPrefilter ],
	tweeners = {
		"*": [ function( prop, value ) {
			var tween = this.createTween( prop, value ),
				target = tween.cur(),
				parts = rfxnum.exec( value ),
				unit = parts && parts[ 3 ] || ( jQuery.cssNumber[ prop ] ? "" : "px" ),

				// Starting value computation is required for potential unit mismatches
				start = ( jQuery.cssNumber[ prop ] || unit !== "px" && +target ) &&
					rfxnum.exec( jQuery.css( tween.elem, prop ) ),
				scale = 1,
				maxIterations = 20;

			if ( start && start[ 3 ] !== unit ) {
				// Trust units reported by jQuery.css
				unit = unit || start[ 3 ];

				// Make sure we update the tween properties later on
				parts = parts || [];

				// Iteratively approximate from a nonzero starting point
				start = +target || 1;

				do {
					// If previous iteration zeroed out, double until we get *something*
					// Use a string for doubling factor so we don't accidentally see scale as unchanged below
					scale = scale || ".5";

					// Adjust and apply
					start = start / scale;
					jQuery.style( tween.elem, prop, start + unit );

				// Update scale, tolerating zero or NaN from tween.cur()
				// And breaking the loop if scale is unchanged or perfect, or if we've just had enough
				} while ( scale !== (scale = tween.cur() / target) && scale !== 1 && --maxIterations );
			}

			// Update tween properties
			if ( parts ) {
				start = tween.start = +start || +target || 0;
				tween.unit = unit;
				// If a +=/-= token was provided, we're doing a relative animation
				tween.end = parts[ 1 ] ?
					start + ( parts[ 1 ] + 1 ) * parts[ 2 ] :
					+parts[ 2 ];
			}

			return tween;
		} ]
	};

// Animations created synchronously will run synchronously
function createFxNow() {
	setTimeout(function() {
		fxNow = undefined;
	});
	return ( fxNow = jQuery.now() );
}

// Generate parameters to create a standard animation
function genFx( type, includeWidth ) {
	var which,
		i = 0,
		attrs = { height: type };

	// if we include width, step value is 1 to do all cssExpand values,
	// if we don't include width, step value is 2 to skip over Left and Right
	includeWidth = includeWidth ? 1 : 0;
	for ( ; i < 4 ; i += 2 - includeWidth ) {
		which = cssExpand[ i ];
		attrs[ "margin" + which ] = attrs[ "padding" + which ] = type;
	}

	if ( includeWidth ) {
		attrs.opacity = attrs.width = type;
	}

	return attrs;
}

function createTween( value, prop, animation ) {
	var tween,
		collection = ( tweeners[ prop ] || [] ).concat( tweeners[ "*" ] ),
		index = 0,
		length = collection.length;
	for ( ; index < length; index++ ) {
		if ( (tween = collection[ index ].call( animation, prop, value )) ) {

			// we're done with this property
			return tween;
		}
	}
}

function defaultPrefilter( elem, props, opts ) {
	/* jshint validthis: true */
	var prop, value, toggle, tween, hooks, oldfire, display, checkDisplay,
		anim = this,
		orig = {},
		style = elem.style,
		hidden = elem.nodeType && isHidden( elem ),
		dataShow = data_priv.get( elem, "fxshow" );

	// handle queue: false promises
	if ( !opts.queue ) {
		hooks = jQuery._queueHooks( elem, "fx" );
		if ( hooks.unqueued == null ) {
			hooks.unqueued = 0;
			oldfire = hooks.empty.fire;
			hooks.empty.fire = function() {
				if ( !hooks.unqueued ) {
					oldfire();
				}
			};
		}
		hooks.unqueued++;

		anim.always(function() {
			// doing this makes sure that the complete handler will be called
			// before this completes
			anim.always(function() {
				hooks.unqueued--;
				if ( !jQuery.queue( elem, "fx" ).length ) {
					hooks.empty.fire();
				}
			});
		});
	}

	// height/width overflow pass
	if ( elem.nodeType === 1 && ( "height" in props || "width" in props ) ) {
		// Make sure that nothing sneaks out
		// Record all 3 overflow attributes because IE9-10 do not
		// change the overflow attribute when overflowX and
		// overflowY are set to the same value
		opts.overflow = [ style.overflow, style.overflowX, style.overflowY ];

		// Set display property to inline-block for height/width
		// animations on inline elements that are having width/height animated
		display = jQuery.css( elem, "display" );

		// Test default display if display is currently "none"
		checkDisplay = display === "none" ?
			data_priv.get( elem, "olddisplay" ) || defaultDisplay( elem.nodeName ) : display;

		if ( checkDisplay === "inline" && jQuery.css( elem, "float" ) === "none" ) {
			style.display = "inline-block";
		}
	}

	if ( opts.overflow ) {
		style.overflow = "hidden";
		anim.always(function() {
			style.overflow = opts.overflow[ 0 ];
			style.overflowX = opts.overflow[ 1 ];
			style.overflowY = opts.overflow[ 2 ];
		});
	}

	// show/hide pass
	for ( prop in props ) {
		value = props[ prop ];
		if ( rfxtypes.exec( value ) ) {
			delete props[ prop ];
			toggle = toggle || value === "toggle";
			if ( value === ( hidden ? "hide" : "show" ) ) {

				// If there is dataShow left over from a stopped hide or show and we are going to proceed with show, we should pretend to be hidden
				if ( value === "show" && dataShow && dataShow[ prop ] !== undefined ) {
					hidden = true;
				} else {
					continue;
				}
			}
			orig[ prop ] = dataShow && dataShow[ prop ] || jQuery.style( elem, prop );

		// Any non-fx value stops us from restoring the original display value
		} else {
			display = undefined;
		}
	}

	if ( !jQuery.isEmptyObject( orig ) ) {
		if ( dataShow ) {
			if ( "hidden" in dataShow ) {
				hidden = dataShow.hidden;
			}
		} else {
			dataShow = data_priv.access( elem, "fxshow", {} );
		}

		// store state if its toggle - enables .stop().toggle() to "reverse"
		if ( toggle ) {
			dataShow.hidden = !hidden;
		}
		if ( hidden ) {
			jQuery( elem ).show();
		} else {
			anim.done(function() {
				jQuery( elem ).hide();
			});
		}
		anim.done(function() {
			var prop;

			data_priv.remove( elem, "fxshow" );
			for ( prop in orig ) {
				jQuery.style( elem, prop, orig[ prop ] );
			}
		});
		for ( prop in orig ) {
			tween = createTween( hidden ? dataShow[ prop ] : 0, prop, anim );

			if ( !( prop in dataShow ) ) {
				dataShow[ prop ] = tween.start;
				if ( hidden ) {
					tween.end = tween.start;
					tween.start = prop === "width" || prop === "height" ? 1 : 0;
				}
			}
		}

	// If this is a noop like .hide().hide(), restore an overwritten display value
	} else if ( (display === "none" ? defaultDisplay( elem.nodeName ) : display) === "inline" ) {
		style.display = display;
	}
}

function propFilter( props, specialEasing ) {
	var index, name, easing, value, hooks;

	// camelCase, specialEasing and expand cssHook pass
	for ( index in props ) {
		name = jQuery.camelCase( index );
		easing = specialEasing[ name ];
		value = props[ index ];
		if ( jQuery.isArray( value ) ) {
			easing = value[ 1 ];
			value = props[ index ] = value[ 0 ];
		}

		if ( index !== name ) {
			props[ name ] = value;
			delete props[ index ];
		}

		hooks = jQuery.cssHooks[ name ];
		if ( hooks && "expand" in hooks ) {
			value = hooks.expand( value );
			delete props[ name ];

			// not quite $.extend, this wont overwrite keys already present.
			// also - reusing 'index' from above because we have the correct "name"
			for ( index in value ) {
				if ( !( index in props ) ) {
					props[ index ] = value[ index ];
					specialEasing[ index ] = easing;
				}
			}
		} else {
			specialEasing[ name ] = easing;
		}
	}
}

function Animation( elem, properties, options ) {
	var result,
		stopped,
		index = 0,
		length = animationPrefilters.length,
		deferred = jQuery.Deferred().always( function() {
			// don't match elem in the :animated selector
			delete tick.elem;
		}),
		tick = function() {
			if ( stopped ) {
				return false;
			}
			var currentTime = fxNow || createFxNow(),
				remaining = Math.max( 0, animation.startTime + animation.duration - currentTime ),
				// archaic crash bug won't allow us to use 1 - ( 0.5 || 0 ) (#12497)
				temp = remaining / animation.duration || 0,
				percent = 1 - temp,
				index = 0,
				length = animation.tweens.length;

			for ( ; index < length ; index++ ) {
				animation.tweens[ index ].run( percent );
			}

			deferred.notifyWith( elem, [ animation, percent, remaining ]);

			if ( percent < 1 && length ) {
				return remaining;
			} else {
				deferred.resolveWith( elem, [ animation ] );
				return false;
			}
		},
		animation = deferred.promise({
			elem: elem,
			props: jQuery.extend( {}, properties ),
			opts: jQuery.extend( true, { specialEasing: {} }, options ),
			originalProperties: properties,
			originalOptions: options,
			startTime: fxNow || createFxNow(),
			duration: options.duration,
			tweens: [],
			createTween: function( prop, end ) {
				var tween = jQuery.Tween( elem, animation.opts, prop, end,
						animation.opts.specialEasing[ prop ] || animation.opts.easing );
				animation.tweens.push( tween );
				return tween;
			},
			stop: function( gotoEnd ) {
				var index = 0,
					// if we are going to the end, we want to run all the tweens
					// otherwise we skip this part
					length = gotoEnd ? animation.tweens.length : 0;
				if ( stopped ) {
					return this;
				}
				stopped = true;
				for ( ; index < length ; index++ ) {
					animation.tweens[ index ].run( 1 );
				}

				// resolve when we played the last frame
				// otherwise, reject
				if ( gotoEnd ) {
					deferred.resolveWith( elem, [ animation, gotoEnd ] );
				} else {
					deferred.rejectWith( elem, [ animation, gotoEnd ] );
				}
				return this;
			}
		}),
		props = animation.props;

	propFilter( props, animation.opts.specialEasing );

	for ( ; index < length ; index++ ) {
		result = animationPrefilters[ index ].call( animation, elem, props, animation.opts );
		if ( result ) {
			return result;
		}
	}

	jQuery.map( props, createTween, animation );

	if ( jQuery.isFunction( animation.opts.start ) ) {
		animation.opts.start.call( elem, animation );
	}

	jQuery.fx.timer(
		jQuery.extend( tick, {
			elem: elem,
			anim: animation,
			queue: animation.opts.queue
		})
	);

	// attach callbacks from options
	return animation.progress( animation.opts.progress )
		.done( animation.opts.done, animation.opts.complete )
		.fail( animation.opts.fail )
		.always( animation.opts.always );
}

jQuery.Animation = jQuery.extend( Animation, {

	tweener: function( props, callback ) {
		if ( jQuery.isFunction( props ) ) {
			callback = props;
			props = [ "*" ];
		} else {
			props = props.split(" ");
		}

		var prop,
			index = 0,
			length = props.length;

		for ( ; index < length ; index++ ) {
			prop = props[ index ];
			tweeners[ prop ] = tweeners[ prop ] || [];
			tweeners[ prop ].unshift( callback );
		}
	},

	prefilter: function( callback, prepend ) {
		if ( prepend ) {
			animationPrefilters.unshift( callback );
		} else {
			animationPrefilters.push( callback );
		}
	}
});

jQuery.speed = function( speed, easing, fn ) {
	var opt = speed && typeof speed === "object" ? jQuery.extend( {}, speed ) : {
		complete: fn || !fn && easing ||
			jQuery.isFunction( speed ) && speed,
		duration: speed,
		easing: fn && easing || easing && !jQuery.isFunction( easing ) && easing
	};

	opt.duration = jQuery.fx.off ? 0 : typeof opt.duration === "number" ? opt.duration :
		opt.duration in jQuery.fx.speeds ? jQuery.fx.speeds[ opt.duration ] : jQuery.fx.speeds._default;

	// normalize opt.queue - true/undefined/null -> "fx"
	if ( opt.queue == null || opt.queue === true ) {
		opt.queue = "fx";
	}

	// Queueing
	opt.old = opt.complete;

	opt.complete = function() {
		if ( jQuery.isFunction( opt.old ) ) {
			opt.old.call( this );
		}

		if ( opt.queue ) {
			jQuery.dequeue( this, opt.queue );
		}
	};

	return opt;
};

jQuery.fn.extend({
	fadeTo: function( speed, to, easing, callback ) {

		// show any hidden elements after setting opacity to 0
		return this.filter( isHidden ).css( "opacity", 0 ).show()

			// animate to the value specified
			.end().animate({ opacity: to }, speed, easing, callback );
	},
	animate: function( prop, speed, easing, callback ) {
		var empty = jQuery.isEmptyObject( prop ),
			optall = jQuery.speed( speed, easing, callback ),
			doAnimation = function() {
				// Operate on a copy of prop so per-property easing won't be lost
				var anim = Animation( this, jQuery.extend( {}, prop ), optall );

				// Empty animations, or finishing resolves immediately
				if ( empty || data_priv.get( this, "finish" ) ) {
					anim.stop( true );
				}
			};
			doAnimation.finish = doAnimation;

		return empty || optall.queue === false ?
			this.each( doAnimation ) :
			this.queue( optall.queue, doAnimation );
	},
	stop: function( type, clearQueue, gotoEnd ) {
		var stopQueue = function( hooks ) {
			var stop = hooks.stop;
			delete hooks.stop;
			stop( gotoEnd );
		};

		if ( typeof type !== "string" ) {
			gotoEnd = clearQueue;
			clearQueue = type;
			type = undefined;
		}
		if ( clearQueue && type !== false ) {
			this.queue( type || "fx", [] );
		}

		return this.each(function() {
			var dequeue = true,
				index = type != null && type + "queueHooks",
				timers = jQuery.timers,
				data = data_priv.get( this );

			if ( index ) {
				if ( data[ index ] && data[ index ].stop ) {
					stopQueue( data[ index ] );
				}
			} else {
				for ( index in data ) {
					if ( data[ index ] && data[ index ].stop && rrun.test( index ) ) {
						stopQueue( data[ index ] );
					}
				}
			}

			for ( index = timers.length; index--; ) {
				if ( timers[ index ].elem === this && (type == null || timers[ index ].queue === type) ) {
					timers[ index ].anim.stop( gotoEnd );
					dequeue = false;
					timers.splice( index, 1 );
				}
			}

			// start the next in the queue if the last step wasn't forced
			// timers currently will call their complete callbacks, which will dequeue
			// but only if they were gotoEnd
			if ( dequeue || !gotoEnd ) {
				jQuery.dequeue( this, type );
			}
		});
	},
	finish: function( type ) {
		if ( type !== false ) {
			type = type || "fx";
		}
		return this.each(function() {
			var index,
				data = data_priv.get( this ),
				queue = data[ type + "queue" ],
				hooks = data[ type + "queueHooks" ],
				timers = jQuery.timers,
				length = queue ? queue.length : 0;

			// enable finishing flag on private data
			data.finish = true;

			// empty the queue first
			jQuery.queue( this, type, [] );

			if ( hooks && hooks.stop ) {
				hooks.stop.call( this, true );
			}

			// look for any active animations, and finish them
			for ( index = timers.length; index--; ) {
				if ( timers[ index ].elem === this && timers[ index ].queue === type ) {
					timers[ index ].anim.stop( true );
					timers.splice( index, 1 );
				}
			}

			// look for any animations in the old queue and finish them
			for ( index = 0; index < length; index++ ) {
				if ( queue[ index ] && queue[ index ].finish ) {
					queue[ index ].finish.call( this );
				}
			}

			// turn off finishing flag
			delete data.finish;
		});
	}
});

jQuery.each([ "toggle", "show", "hide" ], function( i, name ) {
	var cssFn = jQuery.fn[ name ];
	jQuery.fn[ name ] = function( speed, easing, callback ) {
		return speed == null || typeof speed === "boolean" ?
			cssFn.apply( this, arguments ) :
			this.animate( genFx( name, true ), speed, easing, callback );
	};
});

// Generate shortcuts for custom animations
jQuery.each({
	slideDown: genFx("show"),
	slideUp: genFx("hide"),
	slideToggle: genFx("toggle"),
	fadeIn: { opacity: "show" },
	fadeOut: { opacity: "hide" },
	fadeToggle: { opacity: "toggle" }
}, function( name, props ) {
	jQuery.fn[ name ] = function( speed, easing, callback ) {
		return this.animate( props, speed, easing, callback );
	};
});

jQuery.timers = [];
jQuery.fx.tick = function() {
	var timer,
		i = 0,
		timers = jQuery.timers;

	fxNow = jQuery.now();

	for ( ; i < timers.length; i++ ) {
		timer = timers[ i ];
		// Checks the timer has not already been removed
		if ( !timer() && timers[ i ] === timer ) {
			timers.splice( i--, 1 );
		}
	}

	if ( !timers.length ) {
		jQuery.fx.stop();
	}
	fxNow = undefined;
};

jQuery.fx.timer = function( timer ) {
	jQuery.timers.push( timer );
	if ( timer() ) {
		jQuery.fx.start();
	} else {
		jQuery.timers.pop();
	}
};

jQuery.fx.interval = 13;

jQuery.fx.start = function() {
	if ( !timerId ) {
		timerId = setInterval( jQuery.fx.tick, jQuery.fx.interval );
	}
};

jQuery.fx.stop = function() {
	clearInterval( timerId );
	timerId = null;
};

jQuery.fx.speeds = {
	slow: 600,
	fast: 200,
	// Default speed
	_default: 400
};


// Based off of the plugin by Clint Helfers, with permission.
// http://blindsignals.com/index.php/2009/07/jquery-delay/
jQuery.fn.delay = function( time, type ) {
	time = jQuery.fx ? jQuery.fx.speeds[ time ] || time : time;
	type = type || "fx";

	return this.queue( type, function( next, hooks ) {
		var timeout = setTimeout( next, time );
		hooks.stop = function() {
			clearTimeout( timeout );
		};
	});
};


(function() {
	var input = document.createElement( "input" ),
		select = document.createElement( "select" ),
		opt = select.appendChild( document.createElement( "option" ) );

	input.type = "checkbox";

	// Support: iOS 5.1, Android 4.x, Android 2.3
	// Check the default checkbox/radio value ("" on old WebKit; "on" elsewhere)
	support.checkOn = input.value !== "";

	// Must access the parent to make an option select properly
	// Support: IE9, IE10
	support.optSelected = opt.selected;

	// Make sure that the options inside disabled selects aren't marked as disabled
	// (WebKit marks them as disabled)
	select.disabled = true;
	support.optDisabled = !opt.disabled;

	// Check if an input maintains its value after becoming a radio
	// Support: IE9, IE10
	input = document.createElement( "input" );
	input.value = "t";
	input.type = "radio";
	support.radioValue = input.value === "t";
})();


var nodeHook, boolHook,
	attrHandle = jQuery.expr.attrHandle;

jQuery.fn.extend({
	attr: function( name, value ) {
		return access( this, jQuery.attr, name, value, arguments.length > 1 );
	},

	removeAttr: function( name ) {
		return this.each(function() {
			jQuery.removeAttr( this, name );
		});
	}
});

jQuery.extend({
	attr: function( elem, name, value ) {
		var hooks, ret,
			nType = elem.nodeType;

		// don't get/set attributes on text, comment and attribute nodes
		if ( !elem || nType === 3 || nType === 8 || nType === 2 ) {
			return;
		}

		// Fallback to prop when attributes are not supported
		if ( typeof elem.getAttribute === strundefined ) {
			return jQuery.prop( elem, name, value );
		}

		// All attributes are lowercase
		// Grab necessary hook if one is defined
		if ( nType !== 1 || !jQuery.isXMLDoc( elem ) ) {
			name = name.toLowerCase();
			hooks = jQuery.attrHooks[ name ] ||
				( jQuery.expr.match.bool.test( name ) ? boolHook : nodeHook );
		}

		if ( value !== undefined ) {

			if ( value === null ) {
				jQuery.removeAttr( elem, name );

			} else if ( hooks && "set" in hooks && (ret = hooks.set( elem, value, name )) !== undefined ) {
				return ret;

			} else {
				elem.setAttribute( name, value + "" );
				return value;
			}

		} else if ( hooks && "get" in hooks && (ret = hooks.get( elem, name )) !== null ) {
			return ret;

		} else {
			ret = jQuery.find.attr( elem, name );

			// Non-existent attributes return null, we normalize to undefined
			return ret == null ?
				undefined :
				ret;
		}
	},

	removeAttr: function( elem, value ) {
		var name, propName,
			i = 0,
			attrNames = value && value.match( rnotwhite );

		if ( attrNames && elem.nodeType === 1 ) {
			while ( (name = attrNames[i++]) ) {
				propName = jQuery.propFix[ name ] || name;

				// Boolean attributes get special treatment (#10870)
				if ( jQuery.expr.match.bool.test( name ) ) {
					// Set corresponding property to false
					elem[ propName ] = false;
				}

				elem.removeAttribute( name );
			}
		}
	},

	attrHooks: {
		type: {
			set: function( elem, value ) {
				if ( !support.radioValue && value === "radio" &&
					jQuery.nodeName( elem, "input" ) ) {
					// Setting the type on a radio button after the value resets the value in IE6-9
					// Reset value to default in case type is set after value during creation
					var val = elem.value;
					elem.setAttribute( "type", value );
					if ( val ) {
						elem.value = val;
					}
					return value;
				}
			}
		}
	}
});

// Hooks for boolean attributes
boolHook = {
	set: function( elem, value, name ) {
		if ( value === false ) {
			// Remove boolean attributes when set to false
			jQuery.removeAttr( elem, name );
		} else {
			elem.setAttribute( name, name );
		}
		return name;
	}
};
jQuery.each( jQuery.expr.match.bool.source.match( /\w+/g ), function( i, name ) {
	var getter = attrHandle[ name ] || jQuery.find.attr;

	attrHandle[ name ] = function( elem, name, isXML ) {
		var ret, handle;
		if ( !isXML ) {
			// Avoid an infinite loop by temporarily removing this function from the getter
			handle = attrHandle[ name ];
			attrHandle[ name ] = ret;
			ret = getter( elem, name, isXML ) != null ?
				name.toLowerCase() :
				null;
			attrHandle[ name ] = handle;
		}
		return ret;
	};
});




var rfocusable = /^(?:input|select|textarea|button)$/i;

jQuery.fn.extend({
	prop: function( name, value ) {
		return access( this, jQuery.prop, name, value, arguments.length > 1 );
	},

	removeProp: function( name ) {
		return this.each(function() {
			delete this[ jQuery.propFix[ name ] || name ];
		});
	}
});

jQuery.extend({
	propFix: {
		"for": "htmlFor",
		"class": "className"
	},

	prop: function( elem, name, value ) {
		var ret, hooks, notxml,
			nType = elem.nodeType;

		// don't get/set properties on text, comment and attribute nodes
		if ( !elem || nType === 3 || nType === 8 || nType === 2 ) {
			return;
		}

		notxml = nType !== 1 || !jQuery.isXMLDoc( elem );

		if ( notxml ) {
			// Fix name and attach hooks
			name = jQuery.propFix[ name ] || name;
			hooks = jQuery.propHooks[ name ];
		}

		if ( value !== undefined ) {
			return hooks && "set" in hooks && (ret = hooks.set( elem, value, name )) !== undefined ?
				ret :
				( elem[ name ] = value );

		} else {
			return hooks && "get" in hooks && (ret = hooks.get( elem, name )) !== null ?
				ret :
				elem[ name ];
		}
	},

	propHooks: {
		tabIndex: {
			get: function( elem ) {
				return elem.hasAttribute( "tabindex" ) || rfocusable.test( elem.nodeName ) || elem.href ?
					elem.tabIndex :
					-1;
			}
		}
	}
});

// Support: IE9+
// Selectedness for an option in an optgroup can be inaccurate
if ( !support.optSelected ) {
	jQuery.propHooks.selected = {
		get: function( elem ) {
			var parent = elem.parentNode;
			if ( parent && parent.parentNode ) {
				parent.parentNode.selectedIndex;
			}
			return null;
		}
	};
}

jQuery.each([
	"tabIndex",
	"readOnly",
	"maxLength",
	"cellSpacing",
	"cellPadding",
	"rowSpan",
	"colSpan",
	"useMap",
	"frameBorder",
	"contentEditable"
], function() {
	jQuery.propFix[ this.toLowerCase() ] = this;
});




var rclass = /[\t\r\n\f]/g;

jQuery.fn.extend({
	addClass: function( value ) {
		var classes, elem, cur, clazz, j, finalValue,
			proceed = typeof value === "string" && value,
			i = 0,
			len = this.length;

		if ( jQuery.isFunction( value ) ) {
			return this.each(function( j ) {
				jQuery( this ).addClass( value.call( this, j, this.className ) );
			});
		}

		if ( proceed ) {
			// The disjunction here is for better compressibility (see removeClass)
			classes = ( value || "" ).match( rnotwhite ) || [];

			for ( ; i < len; i++ ) {
				elem = this[ i ];
				cur = elem.nodeType === 1 && ( elem.className ?
					( " " + elem.className + " " ).replace( rclass, " " ) :
					" "
				);

				if ( cur ) {
					j = 0;
					while ( (clazz = classes[j++]) ) {
						if ( cur.indexOf( " " + clazz + " " ) < 0 ) {
							cur += clazz + " ";
						}
					}

					// only assign if different to avoid unneeded rendering.
					finalValue = jQuery.trim( cur );
					if ( elem.className !== finalValue ) {
						elem.className = finalValue;
					}
				}
			}
		}

		return this;
	},

	removeClass: function( value ) {
		var classes, elem, cur, clazz, j, finalValue,
			proceed = arguments.length === 0 || typeof value === "string" && value,
			i = 0,
			len = this.length;

		if ( jQuery.isFunction( value ) ) {
			return this.each(function( j ) {
				jQuery( this ).removeClass( value.call( this, j, this.className ) );
			});
		}
		if ( proceed ) {
			classes = ( value || "" ).match( rnotwhite ) || [];

			for ( ; i < len; i++ ) {
				elem = this[ i ];
				// This expression is here for better compressibility (see addClass)
				cur = elem.nodeType === 1 && ( elem.className ?
					( " " + elem.className + " " ).replace( rclass, " " ) :
					""
				);

				if ( cur ) {
					j = 0;
					while ( (clazz = classes[j++]) ) {
						// Remove *all* instances
						while ( cur.indexOf( " " + clazz + " " ) >= 0 ) {
							cur = cur.replace( " " + clazz + " ", " " );
						}
					}

					// only assign if different to avoid unneeded rendering.
					finalValue = value ? jQuery.trim( cur ) : "";
					if ( elem.className !== finalValue ) {
						elem.className = finalValue;
					}
				}
			}
		}

		return this;
	},

	toggleClass: function( value, stateVal ) {
		var type = typeof value;

		if ( typeof stateVal === "boolean" && type === "string" ) {
			return stateVal ? this.addClass( value ) : this.removeClass( value );
		}

		if ( jQuery.isFunction( value ) ) {
			return this.each(function( i ) {
				jQuery( this ).toggleClass( value.call(this, i, this.className, stateVal), stateVal );
			});
		}

		return this.each(function() {
			if ( type === "string" ) {
				// toggle individual class names
				var className,
					i = 0,
					self = jQuery( this ),
					classNames = value.match( rnotwhite ) || [];

				while ( (className = classNames[ i++ ]) ) {
					// check each className given, space separated list
					if ( self.hasClass( className ) ) {
						self.removeClass( className );
					} else {
						self.addClass( className );
					}
				}

			// Toggle whole class name
			} else if ( type === strundefined || type === "boolean" ) {
				if ( this.className ) {
					// store className if set
					data_priv.set( this, "__className__", this.className );
				}

				// If the element has a class name or if we're passed "false",
				// then remove the whole classname (if there was one, the above saved it).
				// Otherwise bring back whatever was previously saved (if anything),
				// falling back to the empty string if nothing was stored.
				this.className = this.className || value === false ? "" : data_priv.get( this, "__className__" ) || "";
			}
		});
	},

	hasClass: function( selector ) {
		var className = " " + selector + " ",
			i = 0,
			l = this.length;
		for ( ; i < l; i++ ) {
			if ( this[i].nodeType === 1 && (" " + this[i].className + " ").replace(rclass, " ").indexOf( className ) >= 0 ) {
				return true;
			}
		}

		return false;
	}
});




var rreturn = /\r/g;

jQuery.fn.extend({
	val: function( value ) {
		var hooks, ret, isFunction,
			elem = this[0];

		if ( !arguments.length ) {
			if ( elem ) {
				hooks = jQuery.valHooks[ elem.type ] || jQuery.valHooks[ elem.nodeName.toLowerCase() ];

				if ( hooks && "get" in hooks && (ret = hooks.get( elem, "value" )) !== undefined ) {
					return ret;
				}

				ret = elem.value;

				return typeof ret === "string" ?
					// handle most common string cases
					ret.replace(rreturn, "") :
					// handle cases where value is null/undef or number
					ret == null ? "" : ret;
			}

			return;
		}

		isFunction = jQuery.isFunction( value );

		return this.each(function( i ) {
			var val;

			if ( this.nodeType !== 1 ) {
				return;
			}

			if ( isFunction ) {
				val = value.call( this, i, jQuery( this ).val() );
			} else {
				val = value;
			}

			// Treat null/undefined as ""; convert numbers to string
			if ( val == null ) {
				val = "";

			} else if ( typeof val === "number" ) {
				val += "";

			} else if ( jQuery.isArray( val ) ) {
				val = jQuery.map( val, function( value ) {
					return value == null ? "" : value + "";
				});
			}

			hooks = jQuery.valHooks[ this.type ] || jQuery.valHooks[ this.nodeName.toLowerCase() ];

			// If set returns undefined, fall back to normal setting
			if ( !hooks || !("set" in hooks) || hooks.set( this, val, "value" ) === undefined ) {
				this.value = val;
			}
		});
	}
});

jQuery.extend({
	valHooks: {
		option: {
			get: function( elem ) {
				var val = jQuery.find.attr( elem, "value" );
				return val != null ?
					val :
					// Support: IE10-11+
					// option.text throws exceptions (#14686, #14858)
					jQuery.trim( jQuery.text( elem ) );
			}
		},
		select: {
			get: function( elem ) {
				var value, option,
					options = elem.options,
					index = elem.selectedIndex,
					one = elem.type === "select-one" || index < 0,
					values = one ? null : [],
					max = one ? index + 1 : options.length,
					i = index < 0 ?
						max :
						one ? index : 0;

				// Loop through all the selected options
				for ( ; i < max; i++ ) {
					option = options[ i ];

					// IE6-9 doesn't update selected after form reset (#2551)
					if ( ( option.selected || i === index ) &&
							// Don't return options that are disabled or in a disabled optgroup
							( support.optDisabled ? !option.disabled : option.getAttribute( "disabled" ) === null ) &&
							( !option.parentNode.disabled || !jQuery.nodeName( option.parentNode, "optgroup" ) ) ) {

						// Get the specific value for the option
						value = jQuery( option ).val();

						// We don't need an array for one selects
						if ( one ) {
							return value;
						}

						// Multi-Selects return an array
						values.push( value );
					}
				}

				return values;
			},

			set: function( elem, value ) {
				var optionSet, option,
					options = elem.options,
					values = jQuery.makeArray( value ),
					i = options.length;

				while ( i-- ) {
					option = options[ i ];
					if ( (option.selected = jQuery.inArray( option.value, values ) >= 0) ) {
						optionSet = true;
					}
				}

				// force browsers to behave consistently when non-matching value is set
				if ( !optionSet ) {
					elem.selectedIndex = -1;
				}
				return values;
			}
		}
	}
});

// Radios and checkboxes getter/setter
jQuery.each([ "radio", "checkbox" ], function() {
	jQuery.valHooks[ this ] = {
		set: function( elem, value ) {
			if ( jQuery.isArray( value ) ) {
				return ( elem.checked = jQuery.inArray( jQuery(elem).val(), value ) >= 0 );
			}
		}
	};
	if ( !support.checkOn ) {
		jQuery.valHooks[ this ].get = function( elem ) {
			// Support: Webkit
			// "" is returned instead of "on" if a value isn't specified
			return elem.getAttribute("value") === null ? "on" : elem.value;
		};
	}
});




// Return jQuery for attributes-only inclusion


jQuery.each( ("blur focus focusin focusout load resize scroll unload click dblclick " +
	"mousedown mouseup mousemove mouseover mouseout mouseenter mouseleave " +
	"change select submit keydown keypress keyup error contextmenu").split(" "), function( i, name ) {

	// Handle event binding
	jQuery.fn[ name ] = function( data, fn ) {
		return arguments.length > 0 ?
			this.on( name, null, data, fn ) :
			this.trigger( name );
	};
});

jQuery.fn.extend({
	hover: function( fnOver, fnOut ) {
		return this.mouseenter( fnOver ).mouseleave( fnOut || fnOver );
	},

	bind: function( types, data, fn ) {
		return this.on( types, null, data, fn );
	},
	unbind: function( types, fn ) {
		return this.off( types, null, fn );
	},

	delegate: function( selector, types, data, fn ) {
		return this.on( types, selector, data, fn );
	},
	undelegate: function( selector, types, fn ) {
		// ( namespace ) or ( selector, types [, fn] )
		return arguments.length === 1 ? this.off( selector, "**" ) : this.off( types, selector || "**", fn );
	}
});


var nonce = jQuery.now();

var rquery = (/\?/);



// Support: Android 2.3
// Workaround failure to string-cast null input
jQuery.parseJSON = function( data ) {
	return JSON.parse( data + "" );
};


// Cross-browser xml parsing
jQuery.parseXML = function( data ) {
	var xml, tmp;
	if ( !data || typeof data !== "string" ) {
		return null;
	}

	// Support: IE9
	try {
		tmp = new DOMParser();
		xml = tmp.parseFromString( data, "text/xml" );
	} catch ( e ) {
		xml = undefined;
	}

	if ( !xml || xml.getElementsByTagName( "parsererror" ).length ) {
		jQuery.error( "Invalid XML: " + data );
	}
	return xml;
};


var
	// Document location
	ajaxLocParts,
	ajaxLocation,

	rhash = /#.*$/,
	rts = /([?&])_=[^&]*/,
	rheaders = /^(.*?):[ \t]*([^\r\n]*)$/mg,
	// #7653, #8125, #8152: local protocol detection
	rlocalProtocol = /^(?:about|app|app-storage|.+-extension|file|res|widget):$/,
	rnoContent = /^(?:GET|HEAD)$/,
	rprotocol = /^\/\//,
	rurl = /^([\w.+-]+:)(?:\/\/(?:[^\/?#]*@|)([^\/?#:]*)(?::(\d+)|)|)/,

	/* Prefilters
	 * 1) They are useful to introduce custom dataTypes (see ajax/jsonp.js for an example)
	 * 2) These are called:
	 *    - BEFORE asking for a transport
	 *    - AFTER param serialization (s.data is a string if s.processData is true)
	 * 3) key is the dataType
	 * 4) the catchall symbol "*" can be used
	 * 5) execution will start with transport dataType and THEN continue down to "*" if needed
	 */
	prefilters = {},

	/* Transports bindings
	 * 1) key is the dataType
	 * 2) the catchall symbol "*" can be used
	 * 3) selection will start with transport dataType and THEN go to "*" if needed
	 */
	transports = {},

	// Avoid comment-prolog char sequence (#10098); must appease lint and evade compression
	allTypes = "*/".concat("*");

// #8138, IE may throw an exception when accessing
// a field from window.location if document.domain has been set
try {
	ajaxLocation = location.href;
} catch( e ) {
	// Use the href attribute of an A element
	// since IE will modify it given document.location
	ajaxLocation = document.createElement( "a" );
	ajaxLocation.href = "";
	ajaxLocation = ajaxLocation.href;
}

// Segment location into parts
ajaxLocParts = rurl.exec( ajaxLocation.toLowerCase() ) || [];

// Base "constructor" for jQuery.ajaxPrefilter and jQuery.ajaxTransport
function addToPrefiltersOrTransports( structure ) {

	// dataTypeExpression is optional and defaults to "*"
	return function( dataTypeExpression, func ) {

		if ( typeof dataTypeExpression !== "string" ) {
			func = dataTypeExpression;
			dataTypeExpression = "*";
		}

		var dataType,
			i = 0,
			dataTypes = dataTypeExpression.toLowerCase().match( rnotwhite ) || [];

		if ( jQuery.isFunction( func ) ) {
			// For each dataType in the dataTypeExpression
			while ( (dataType = dataTypes[i++]) ) {
				// Prepend if requested
				if ( dataType[0] === "+" ) {
					dataType = dataType.slice( 1 ) || "*";
					(structure[ dataType ] = structure[ dataType ] || []).unshift( func );

				// Otherwise append
				} else {
					(structure[ dataType ] = structure[ dataType ] || []).push( func );
				}
			}
		}
	};
}

// Base inspection function for prefilters and transports
function inspectPrefiltersOrTransports( structure, options, originalOptions, jqXHR ) {

	var inspected = {},
		seekingTransport = ( structure === transports );

	function inspect( dataType ) {
		var selected;
		inspected[ dataType ] = true;
		jQuery.each( structure[ dataType ] || [], function( _, prefilterOrFactory ) {
			var dataTypeOrTransport = prefilterOrFactory( options, originalOptions, jqXHR );
			if ( typeof dataTypeOrTransport === "string" && !seekingTransport && !inspected[ dataTypeOrTransport ] ) {
				options.dataTypes.unshift( dataTypeOrTransport );
				inspect( dataTypeOrTransport );
				return false;
			} else if ( seekingTransport ) {
				return !( selected = dataTypeOrTransport );
			}
		});
		return selected;
	}

	return inspect( options.dataTypes[ 0 ] ) || !inspected[ "*" ] && inspect( "*" );
}

// A special extend for ajax options
// that takes "flat" options (not to be deep extended)
// Fixes #9887
function ajaxExtend( target, src ) {
	var key, deep,
		flatOptions = jQuery.ajaxSettings.flatOptions || {};

	for ( key in src ) {
		if ( src[ key ] !== undefined ) {
			( flatOptions[ key ] ? target : ( deep || (deep = {}) ) )[ key ] = src[ key ];
		}
	}
	if ( deep ) {
		jQuery.extend( true, target, deep );
	}

	return target;
}

/* Handles responses to an ajax request:
 * - finds the right dataType (mediates between content-type and expected dataType)
 * - returns the corresponding response
 */
function ajaxHandleResponses( s, jqXHR, responses ) {

	var ct, type, finalDataType, firstDataType,
		contents = s.contents,
		dataTypes = s.dataTypes;

	// Remove auto dataType and get content-type in the process
	while ( dataTypes[ 0 ] === "*" ) {
		dataTypes.shift();
		if ( ct === undefined ) {
			ct = s.mimeType || jqXHR.getResponseHeader("Content-Type");
		}
	}

	// Check if we're dealing with a known content-type
	if ( ct ) {
		for ( type in contents ) {
			if ( contents[ type ] && contents[ type ].test( ct ) ) {
				dataTypes.unshift( type );
				break;
			}
		}
	}

	// Check to see if we have a response for the expected dataType
	if ( dataTypes[ 0 ] in responses ) {
		finalDataType = dataTypes[ 0 ];
	} else {
		// Try convertible dataTypes
		for ( type in responses ) {
			if ( !dataTypes[ 0 ] || s.converters[ type + " " + dataTypes[0] ] ) {
				finalDataType = type;
				break;
			}
			if ( !firstDataType ) {
				firstDataType = type;
			}
		}
		// Or just use first one
		finalDataType = finalDataType || firstDataType;
	}

	// If we found a dataType
	// We add the dataType to the list if needed
	// and return the corresponding response
	if ( finalDataType ) {
		if ( finalDataType !== dataTypes[ 0 ] ) {
			dataTypes.unshift( finalDataType );
		}
		return responses[ finalDataType ];
	}
}

/* Chain conversions given the request and the original response
 * Also sets the responseXXX fields on the jqXHR instance
 */
function ajaxConvert( s, response, jqXHR, isSuccess ) {
	var conv2, current, conv, tmp, prev,
		converters = {},
		// Work with a copy of dataTypes in case we need to modify it for conversion
		dataTypes = s.dataTypes.slice();

	// Create converters map with lowercased keys
	if ( dataTypes[ 1 ] ) {
		for ( conv in s.converters ) {
			converters[ conv.toLowerCase() ] = s.converters[ conv ];
		}
	}

	current = dataTypes.shift();

	// Convert to each sequential dataType
	while ( current ) {

		if ( s.responseFields[ current ] ) {
			jqXHR[ s.responseFields[ current ] ] = response;
		}

		// Apply the dataFilter if provided
		if ( !prev && isSuccess && s.dataFilter ) {
			response = s.dataFilter( response, s.dataType );
		}

		prev = current;
		current = dataTypes.shift();

		if ( current ) {

		// There's only work to do if current dataType is non-auto
			if ( current === "*" ) {

				current = prev;

			// Convert response if prev dataType is non-auto and differs from current
			} else if ( prev !== "*" && prev !== current ) {

				// Seek a direct converter
				conv = converters[ prev + " " + current ] || converters[ "* " + current ];

				// If none found, seek a pair
				if ( !conv ) {
					for ( conv2 in converters ) {

						// If conv2 outputs current
						tmp = conv2.split( " " );
						if ( tmp[ 1 ] === current ) {

							// If prev can be converted to accepted input
							conv = converters[ prev + " " + tmp[ 0 ] ] ||
								converters[ "* " + tmp[ 0 ] ];
							if ( conv ) {
								// Condense equivalence converters
								if ( conv === true ) {
									conv = converters[ conv2 ];

								// Otherwise, insert the intermediate dataType
								} else if ( converters[ conv2 ] !== true ) {
									current = tmp[ 0 ];
									dataTypes.unshift( tmp[ 1 ] );
								}
								break;
							}
						}
					}
				}

				// Apply converter (if not an equivalence)
				if ( conv !== true ) {

					// Unless errors are allowed to bubble, catch and return them
					if ( conv && s[ "throws" ] ) {
						response = conv( response );
					} else {
						try {
							response = conv( response );
						} catch ( e ) {
							return { state: "parsererror", error: conv ? e : "No conversion from " + prev + " to " + current };
						}
					}
				}
			}
		}
	}

	return { state: "success", data: response };
}

jQuery.extend({

	// Counter for holding the number of active queries
	active: 0,

	// Last-Modified header cache for next request
	lastModified: {},
	etag: {},

	ajaxSettings: {
		url: ajaxLocation,
		type: "GET",
		isLocal: rlocalProtocol.test( ajaxLocParts[ 1 ] ),
		global: true,
		processData: true,
		async: true,
		contentType: "application/x-www-form-urlencoded; charset=UTF-8",
		/*
		timeout: 0,
		data: null,
		dataType: null,
		username: null,
		password: null,
		cache: null,
		throws: false,
		traditional: false,
		headers: {},
		*/

		accepts: {
			"*": allTypes,
			text: "text/plain",
			html: "text/html",
			xml: "application/xml, text/xml",
			json: "application/json, text/javascript"
		},

		contents: {
			xml: /xml/,
			html: /html/,
			json: /json/
		},

		responseFields: {
			xml: "responseXML",
			text: "responseText",
			json: "responseJSON"
		},

		// Data converters
		// Keys separate source (or catchall "*") and destination types with a single space
		converters: {

			// Convert anything to text
			"* text": String,

			// Text to html (true = no transformation)
			"text html": true,

			// Evaluate text as a json expression
			"text json": jQuery.parseJSON,

			// Parse text as xml
			"text xml": jQuery.parseXML
		},

		// For options that shouldn't be deep extended:
		// you can add your own custom options here if
		// and when you create one that shouldn't be
		// deep extended (see ajaxExtend)
		flatOptions: {
			url: true,
			context: true
		}
	},

	// Creates a full fledged settings object into target
	// with both ajaxSettings and settings fields.
	// If target is omitted, writes into ajaxSettings.
	ajaxSetup: function( target, settings ) {
		return settings ?

			// Building a settings object
			ajaxExtend( ajaxExtend( target, jQuery.ajaxSettings ), settings ) :

			// Extending ajaxSettings
			ajaxExtend( jQuery.ajaxSettings, target );
	},

	ajaxPrefilter: addToPrefiltersOrTransports( prefilters ),
	ajaxTransport: addToPrefiltersOrTransports( transports ),

	// Main method
	ajax: function( url, options ) {

		// If url is an object, simulate pre-1.5 signature
		if ( typeof url === "object" ) {
			options = url;
			url = undefined;
		}

		// Force options to be an object
		options = options || {};

		var transport,
			// URL without anti-cache param
			cacheURL,
			// Response headers
			responseHeadersString,
			responseHeaders,
			// timeout handle
			timeoutTimer,
			// Cross-domain detection vars
			parts,
			// To know if global events are to be dispatched
			fireGlobals,
			// Loop variable
			i,
			// Create the final options object
			s = jQuery.ajaxSetup( {}, options ),
			// Callbacks context
			callbackContext = s.context || s,
			// Context for global events is callbackContext if it is a DOM node or jQuery collection
			globalEventContext = s.context && ( callbackContext.nodeType || callbackContext.jquery ) ?
				jQuery( callbackContext ) :
				jQuery.event,
			// Deferreds
			deferred = jQuery.Deferred(),
			completeDeferred = jQuery.Callbacks("once memory"),
			// Status-dependent callbacks
			statusCode = s.statusCode || {},
			// Headers (they are sent all at once)
			requestHeaders = {},
			requestHeadersNames = {},
			// The jqXHR state
			state = 0,
			// Default abort message
			strAbort = "canceled",
			// Fake xhr
			jqXHR = {
				readyState: 0,

				// Builds headers hashtable if needed
				getResponseHeader: function( key ) {
					var match;
					if ( state === 2 ) {
						if ( !responseHeaders ) {
							responseHeaders = {};
							while ( (match = rheaders.exec( responseHeadersString )) ) {
								responseHeaders[ match[1].toLowerCase() ] = match[ 2 ];
							}
						}
						match = responseHeaders[ key.toLowerCase() ];
					}
					return match == null ? null : match;
				},

				// Raw string
				getAllResponseHeaders: function() {
					return state === 2 ? responseHeadersString : null;
				},

				// Caches the header
				setRequestHeader: function( name, value ) {
					var lname = name.toLowerCase();
					if ( !state ) {
						name = requestHeadersNames[ lname ] = requestHeadersNames[ lname ] || name;
						requestHeaders[ name ] = value;
					}
					return this;
				},

				// Overrides response content-type header
				overrideMimeType: function( type ) {
					if ( !state ) {
						s.mimeType = type;
					}
					return this;
				},

				// Status-dependent callbacks
				statusCode: function( map ) {
					var code;
					if ( map ) {
						if ( state < 2 ) {
							for ( code in map ) {
								// Lazy-add the new callback in a way that preserves old ones
								statusCode[ code ] = [ statusCode[ code ], map[ code ] ];
							}
						} else {
							// Execute the appropriate callbacks
							jqXHR.always( map[ jqXHR.status ] );
						}
					}
					return this;
				},

				// Cancel the request
				abort: function( statusText ) {
					var finalText = statusText || strAbort;
					if ( transport ) {
						transport.abort( finalText );
					}
					done( 0, finalText );
					return this;
				}
			};

		// Attach deferreds
		deferred.promise( jqXHR ).complete = completeDeferred.add;
		jqXHR.success = jqXHR.done;
		jqXHR.error = jqXHR.fail;

		// Remove hash character (#7531: and string promotion)
		// Add protocol if not provided (prefilters might expect it)
		// Handle falsy url in the settings object (#10093: consistency with old signature)
		// We also use the url parameter if available
		s.url = ( ( url || s.url || ajaxLocation ) + "" ).replace( rhash, "" )
			.replace( rprotocol, ajaxLocParts[ 1 ] + "//" );

		// Alias method option to type as per ticket #12004
		s.type = options.method || options.type || s.method || s.type;

		// Extract dataTypes list
		s.dataTypes = jQuery.trim( s.dataType || "*" ).toLowerCase().match( rnotwhite ) || [ "" ];

		// A cross-domain request is in order when we have a protocol:host:port mismatch
		if ( s.crossDomain == null ) {
			parts = rurl.exec( s.url.toLowerCase() );
			s.crossDomain = !!( parts &&
				( parts[ 1 ] !== ajaxLocParts[ 1 ] || parts[ 2 ] !== ajaxLocParts[ 2 ] ||
					( parts[ 3 ] || ( parts[ 1 ] === "http:" ? "80" : "443" ) ) !==
						( ajaxLocParts[ 3 ] || ( ajaxLocParts[ 1 ] === "http:" ? "80" : "443" ) ) )
			);
		}

		// Convert data if not already a string
		if ( s.data && s.processData && typeof s.data !== "string" ) {
			s.data = jQuery.param( s.data, s.traditional );
		}

		// Apply prefilters
		inspectPrefiltersOrTransports( prefilters, s, options, jqXHR );

		// If request was aborted inside a prefilter, stop there
		if ( state === 2 ) {
			return jqXHR;
		}

		// We can fire global events as of now if asked to
		fireGlobals = s.global;

		// Watch for a new set of requests
		if ( fireGlobals && jQuery.active++ === 0 ) {
			jQuery.event.trigger("ajaxStart");
		}

		// Uppercase the type
		s.type = s.type.toUpperCase();

		// Determine if request has content
		s.hasContent = !rnoContent.test( s.type );

		// Save the URL in case we're toying with the If-Modified-Since
		// and/or If-None-Match header later on
		cacheURL = s.url;

		// More options handling for requests with no content
		if ( !s.hasContent ) {

			// If data is available, append data to url
			if ( s.data ) {
				cacheURL = ( s.url += ( rquery.test( cacheURL ) ? "&" : "?" ) + s.data );
				// #9682: remove data so that it's not used in an eventual retry
				delete s.data;
			}

			// Add anti-cache in url if needed
			if ( s.cache === false ) {
				s.url = rts.test( cacheURL ) ?

					// If there is already a '_' parameter, set its value
					cacheURL.replace( rts, "$1_=" + nonce++ ) :

					// Otherwise add one to the end
					cacheURL + ( rquery.test( cacheURL ) ? "&" : "?" ) + "_=" + nonce++;
			}
		}

		// Set the If-Modified-Since and/or If-None-Match header, if in ifModified mode.
		if ( s.ifModified ) {
			if ( jQuery.lastModified[ cacheURL ] ) {
				jqXHR.setRequestHeader( "If-Modified-Since", jQuery.lastModified[ cacheURL ] );
			}
			if ( jQuery.etag[ cacheURL ] ) {
				jqXHR.setRequestHeader( "If-None-Match", jQuery.etag[ cacheURL ] );
			}
		}

		// Set the correct header, if data is being sent
		if ( s.data && s.hasContent && s.contentType !== false || options.contentType ) {
			jqXHR.setRequestHeader( "Content-Type", s.contentType );
		}

		// Set the Accepts header for the server, depending on the dataType
		jqXHR.setRequestHeader(
			"Accept",
			s.dataTypes[ 0 ] && s.accepts[ s.dataTypes[0] ] ?
				s.accepts[ s.dataTypes[0] ] + ( s.dataTypes[ 0 ] !== "*" ? ", " + allTypes + "; q=0.01" : "" ) :
				s.accepts[ "*" ]
		);

		// Check for headers option
		for ( i in s.headers ) {
			jqXHR.setRequestHeader( i, s.headers[ i ] );
		}

		// Allow custom headers/mimetypes and early abort
		if ( s.beforeSend && ( s.beforeSend.call( callbackContext, jqXHR, s ) === false || state === 2 ) ) {
			// Abort if not done already and return
			return jqXHR.abort();
		}

		// aborting is no longer a cancellation
		strAbort = "abort";

		// Install callbacks on deferreds
		for ( i in { success: 1, error: 1, complete: 1 } ) {
			jqXHR[ i ]( s[ i ] );
		}

		// Get transport
		transport = inspectPrefiltersOrTransports( transports, s, options, jqXHR );

		// If no transport, we auto-abort
		if ( !transport ) {
			done( -1, "No Transport" );
		} else {
			jqXHR.readyState = 1;

			// Send global event
			if ( fireGlobals ) {
				globalEventContext.trigger( "ajaxSend", [ jqXHR, s ] );
			}
			// Timeout
			if ( s.async && s.timeout > 0 ) {
				timeoutTimer = setTimeout(function() {
					jqXHR.abort("timeout");
				}, s.timeout );
			}

			try {
				state = 1;
				transport.send( requestHeaders, done );
			} catch ( e ) {
				// Propagate exception as error if not done
				if ( state < 2 ) {
					done( -1, e );
				// Simply rethrow otherwise
				} else {
					throw e;
				}
			}
		}

		// Callback for when everything is done
		function done( status, nativeStatusText, responses, headers ) {
			var isSuccess, success, error, response, modified,
				statusText = nativeStatusText;

			// Called once
			if ( state === 2 ) {
				return;
			}

			// State is "done" now
			state = 2;

			// Clear timeout if it exists
			if ( timeoutTimer ) {
				clearTimeout( timeoutTimer );
			}

			// Dereference transport for early garbage collection
			// (no matter how long the jqXHR object will be used)
			transport = undefined;

			// Cache response headers
			responseHeadersString = headers || "";

			// Set readyState
			jqXHR.readyState = status > 0 ? 4 : 0;

			// Determine if successful
			isSuccess = status >= 200 && status < 300 || status === 304;

			// Get response data
			if ( responses ) {
				response = ajaxHandleResponses( s, jqXHR, responses );
			}

			// Convert no matter what (that way responseXXX fields are always set)
			response = ajaxConvert( s, response, jqXHR, isSuccess );

			// If successful, handle type chaining
			if ( isSuccess ) {

				// Set the If-Modified-Since and/or If-None-Match header, if in ifModified mode.
				if ( s.ifModified ) {
					modified = jqXHR.getResponseHeader("Last-Modified");
					if ( modified ) {
						jQuery.lastModified[ cacheURL ] = modified;
					}
					modified = jqXHR.getResponseHeader("etag");
					if ( modified ) {
						jQuery.etag[ cacheURL ] = modified;
					}
				}

				// if no content
				if ( status === 204 || s.type === "HEAD" ) {
					statusText = "nocontent";

				// if not modified
				} else if ( status === 304 ) {
					statusText = "notmodified";

				// If we have data, let's convert it
				} else {
					statusText = response.state;
					success = response.data;
					error = response.error;
					isSuccess = !error;
				}
			} else {
				// We extract error from statusText
				// then normalize statusText and status for non-aborts
				error = statusText;
				if ( status || !statusText ) {
					statusText = "error";
					if ( status < 0 ) {
						status = 0;
					}
				}
			}

			// Set data for the fake xhr object
			jqXHR.status = status;
			jqXHR.statusText = ( nativeStatusText || statusText ) + "";

			// Success/Error
			if ( isSuccess ) {
				deferred.resolveWith( callbackContext, [ success, statusText, jqXHR ] );
			} else {
				deferred.rejectWith( callbackContext, [ jqXHR, statusText, error ] );
			}

			// Status-dependent callbacks
			jqXHR.statusCode( statusCode );
			statusCode = undefined;

			if ( fireGlobals ) {
				globalEventContext.trigger( isSuccess ? "ajaxSuccess" : "ajaxError",
					[ jqXHR, s, isSuccess ? success : error ] );
			}

			// Complete
			completeDeferred.fireWith( callbackContext, [ jqXHR, statusText ] );

			if ( fireGlobals ) {
				globalEventContext.trigger( "ajaxComplete", [ jqXHR, s ] );
				// Handle the global AJAX counter
				if ( !( --jQuery.active ) ) {
					jQuery.event.trigger("ajaxStop");
				}
			}
		}

		return jqXHR;
	},

	getJSON: function( url, data, callback ) {
		return jQuery.get( url, data, callback, "json" );
	},

	getScript: function( url, callback ) {
		return jQuery.get( url, undefined, callback, "script" );
	}
});

jQuery.each( [ "get", "post" ], function( i, method ) {
	jQuery[ method ] = function( url, data, callback, type ) {
		// shift arguments if data argument was omitted
		if ( jQuery.isFunction( data ) ) {
			type = type || callback;
			callback = data;
			data = undefined;
		}

		return jQuery.ajax({
			url: url,
			type: method,
			dataType: type,
			data: data,
			success: callback
		});
	};
});

// Attach a bunch of functions for handling common AJAX events
jQuery.each( [ "ajaxStart", "ajaxStop", "ajaxComplete", "ajaxError", "ajaxSuccess", "ajaxSend" ], function( i, type ) {
	jQuery.fn[ type ] = function( fn ) {
		return this.on( type, fn );
	};
});


jQuery._evalUrl = function( url ) {
	return jQuery.ajax({
		url: url,
		type: "GET",
		dataType: "script",
		async: false,
		global: false,
		"throws": true
	});
};


jQuery.fn.extend({
	wrapAll: function( html ) {
		var wrap;

		if ( jQuery.isFunction( html ) ) {
			return this.each(function( i ) {
				jQuery( this ).wrapAll( html.call(this, i) );
			});
		}

		if ( this[ 0 ] ) {

			// The elements to wrap the target around
			wrap = jQuery( html, this[ 0 ].ownerDocument ).eq( 0 ).clone( true );

			if ( this[ 0 ].parentNode ) {
				wrap.insertBefore( this[ 0 ] );
			}

			wrap.map(function() {
				var elem = this;

				while ( elem.firstElementChild ) {
					elem = elem.firstElementChild;
				}

				return elem;
			}).append( this );
		}

		return this;
	},

	wrapInner: function( html ) {
		if ( jQuery.isFunction( html ) ) {
			return this.each(function( i ) {
				jQuery( this ).wrapInner( html.call(this, i) );
			});
		}

		return this.each(function() {
			var self = jQuery( this ),
				contents = self.contents();

			if ( contents.length ) {
				contents.wrapAll( html );

			} else {
				self.append( html );
			}
		});
	},

	wrap: function( html ) {
		var isFunction = jQuery.isFunction( html );

		return this.each(function( i ) {
			jQuery( this ).wrapAll( isFunction ? html.call(this, i) : html );
		});
	},

	unwrap: function() {
		return this.parent().each(function() {
			if ( !jQuery.nodeName( this, "body" ) ) {
				jQuery( this ).replaceWith( this.childNodes );
			}
		}).end();
	}
});


jQuery.expr.filters.hidden = function( elem ) {
	// Support: Opera <= 12.12
	// Opera reports offsetWidths and offsetHeights less than zero on some elements
	return elem.offsetWidth <= 0 && elem.offsetHeight <= 0;
};
jQuery.expr.filters.visible = function( elem ) {
	return !jQuery.expr.filters.hidden( elem );
};




var r20 = /%20/g,
	rbracket = /\[\]$/,
	rCRLF = /\r?\n/g,
	rsubmitterTypes = /^(?:submit|button|image|reset|file)$/i,
	rsubmittable = /^(?:input|select|textarea|keygen)/i;

function buildParams( prefix, obj, traditional, add ) {
	var name;

	if ( jQuery.isArray( obj ) ) {
		// Serialize array item.
		jQuery.each( obj, function( i, v ) {
			if ( traditional || rbracket.test( prefix ) ) {
				// Treat each array item as a scalar.
				add( prefix, v );

			} else {
				// Item is non-scalar (array or object), encode its numeric index.
				buildParams( prefix + "[" + ( typeof v === "object" ? i : "" ) + "]", v, traditional, add );
			}
		});

	} else if ( !traditional && jQuery.type( obj ) === "object" ) {
		// Serialize object item.
		for ( name in obj ) {
			buildParams( prefix + "[" + name + "]", obj[ name ], traditional, add );
		}

	} else {
		// Serialize scalar item.
		add( prefix, obj );
	}
}

// Serialize an array of form elements or a set of
// key/values into a query string
jQuery.param = function( a, traditional ) {
	var prefix,
		s = [],
		add = function( key, value ) {
			// If value is a function, invoke it and return its value
			value = jQuery.isFunction( value ) ? value() : ( value == null ? "" : value );
			s[ s.length ] = encodeURIComponent( key ) + "=" + encodeURIComponent( value );
		};

	// Set traditional to true for jQuery <= 1.3.2 behavior.
	if ( traditional === undefined ) {
		traditional = jQuery.ajaxSettings && jQuery.ajaxSettings.traditional;
	}

	// If an array was passed in, assume that it is an array of form elements.
	if ( jQuery.isArray( a ) || ( a.jquery && !jQuery.isPlainObject( a ) ) ) {
		// Serialize the form elements
		jQuery.each( a, function() {
			add( this.name, this.value );
		});

	} else {
		// If traditional, encode the "old" way (the way 1.3.2 or older
		// did it), otherwise encode params recursively.
		for ( prefix in a ) {
			buildParams( prefix, a[ prefix ], traditional, add );
		}
	}

	// Return the resulting serialization
	return s.join( "&" ).replace( r20, "+" );
};

jQuery.fn.extend({
	serialize: function() {
		return jQuery.param( this.serializeArray() );
	},
	serializeArray: function() {
		return this.map(function() {
			// Can add propHook for "elements" to filter or add form elements
			var elements = jQuery.prop( this, "elements" );
			return elements ? jQuery.makeArray( elements ) : this;
		})
		.filter(function() {
			var type = this.type;

			// Use .is( ":disabled" ) so that fieldset[disabled] works
			return this.name && !jQuery( this ).is( ":disabled" ) &&
				rsubmittable.test( this.nodeName ) && !rsubmitterTypes.test( type ) &&
				( this.checked || !rcheckableType.test( type ) );
		})
		.map(function( i, elem ) {
			var val = jQuery( this ).val();

			return val == null ?
				null :
				jQuery.isArray( val ) ?
					jQuery.map( val, function( val ) {
						return { name: elem.name, value: val.replace( rCRLF, "\r\n" ) };
					}) :
					{ name: elem.name, value: val.replace( rCRLF, "\r\n" ) };
		}).get();
	}
});


jQuery.ajaxSettings.xhr = function() {
	try {
		return new XMLHttpRequest();
	} catch( e ) {}
};

var xhrId = 0,
	xhrCallbacks = {},
	xhrSuccessStatus = {
		// file protocol always yields status code 0, assume 200
		0: 200,
		// Support: IE9
		// #1450: sometimes IE returns 1223 when it should be 204
		1223: 204
	},
	xhrSupported = jQuery.ajaxSettings.xhr();

// Support: IE9
// Open requests must be manually aborted on unload (#5280)
if ( window.ActiveXObject ) {
	jQuery( window ).on( "unload", function() {
		for ( var key in xhrCallbacks ) {
			xhrCallbacks[ key ]();
		}
	});
}

support.cors = !!xhrSupported && ( "withCredentials" in xhrSupported );
support.ajax = xhrSupported = !!xhrSupported;

jQuery.ajaxTransport(function( options ) {
	var callback;

	// Cross domain only allowed if supported through XMLHttpRequest
	if ( support.cors || xhrSupported && !options.crossDomain ) {
		return {
			send: function( headers, complete ) {
				var i,
					xhr = options.xhr(),
					id = ++xhrId;

				xhr.open( options.type, options.url, options.async, options.username, options.password );

				// Apply custom fields if provided
				if ( options.xhrFields ) {
					for ( i in options.xhrFields ) {
						xhr[ i ] = options.xhrFields[ i ];
					}
				}

				// Override mime type if needed
				if ( options.mimeType && xhr.overrideMimeType ) {
					xhr.overrideMimeType( options.mimeType );
				}

				// X-Requested-With header
				// For cross-domain requests, seeing as conditions for a preflight are
				// akin to a jigsaw puzzle, we simply never set it to be sure.
				// (it can always be set on a per-request basis or even using ajaxSetup)
				// For same-domain requests, won't change header if already provided.
				if ( !options.crossDomain && !headers["X-Requested-With"] ) {
					headers["X-Requested-With"] = "XMLHttpRequest";
				}

				// Set headers
				for ( i in headers ) {
					xhr.setRequestHeader( i, headers[ i ] );
				}

				// Callback
				callback = function( type ) {
					return function() {
						if ( callback ) {
							delete xhrCallbacks[ id ];
							callback = xhr.onload = xhr.onerror = null;

							if ( type === "abort" ) {
								xhr.abort();
							} else if ( type === "error" ) {
								complete(
									// file: protocol always yields status 0; see #8605, #14207
									xhr.status,
									xhr.statusText
								);
							} else {
								complete(
									xhrSuccessStatus[ xhr.status ] || xhr.status,
									xhr.statusText,
									// Support: IE9
									// Accessing binary-data responseText throws an exception
									// (#11426)
									typeof xhr.responseText === "string" ? {
										text: xhr.responseText
									} : undefined,
									xhr.getAllResponseHeaders()
								);
							}
						}
					};
				};

				// Listen to events
				xhr.onload = callback();
				xhr.onerror = callback("error");

				// Create the abort callback
				callback = xhrCallbacks[ id ] = callback("abort");

				try {
					// Do send the request (this may raise an exception)
					xhr.send( options.hasContent && options.data || null );
				} catch ( e ) {
					// #14683: Only rethrow if this hasn't been notified as an error yet
					if ( callback ) {
						throw e;
					}
				}
			},

			abort: function() {
				if ( callback ) {
					callback();
				}
			}
		};
	}
});




// Install script dataType
jQuery.ajaxSetup({
	accepts: {
		script: "text/javascript, application/javascript, application/ecmascript, application/x-ecmascript"
	},
	contents: {
		script: /(?:java|ecma)script/
	},
	converters: {
		"text script": function( text ) {
			jQuery.globalEval( text );
			return text;
		}
	}
});

// Handle cache's special case and crossDomain
jQuery.ajaxPrefilter( "script", function( s ) {
	if ( s.cache === undefined ) {
		s.cache = false;
	}
	if ( s.crossDomain ) {
		s.type = "GET";
	}
});

// Bind script tag hack transport
jQuery.ajaxTransport( "script", function( s ) {
	// This transport only deals with cross domain requests
	if ( s.crossDomain ) {
		var script, callback;
		return {
			send: function( _, complete ) {
				script = jQuery("<script>").prop({
					async: true,
					charset: s.scriptCharset,
					src: s.url
				}).on(
					"load error",
					callback = function( evt ) {
						script.remove();
						callback = null;
						if ( evt ) {
							complete( evt.type === "error" ? 404 : 200, evt.type );
						}
					}
				);
				document.head.appendChild( script[ 0 ] );
			},
			abort: function() {
				if ( callback ) {
					callback();
				}
			}
		};
	}
});




var oldCallbacks = [],
	rjsonp = /(=)\?(?=&|$)|\?\?/;

// Default jsonp settings
jQuery.ajaxSetup({
	jsonp: "callback",
	jsonpCallback: function() {
		var callback = oldCallbacks.pop() || ( jQuery.expando + "_" + ( nonce++ ) );
		this[ callback ] = true;
		return callback;
	}
});

// Detect, normalize options and install callbacks for jsonp requests
jQuery.ajaxPrefilter( "json jsonp", function( s, originalSettings, jqXHR ) {

	var callbackName, overwritten, responseContainer,
		jsonProp = s.jsonp !== false && ( rjsonp.test( s.url ) ?
			"url" :
			typeof s.data === "string" && !( s.contentType || "" ).indexOf("application/x-www-form-urlencoded") && rjsonp.test( s.data ) && "data"
		);

	// Handle iff the expected data type is "jsonp" or we have a parameter to set
	if ( jsonProp || s.dataTypes[ 0 ] === "jsonp" ) {

		// Get callback name, remembering preexisting value associated with it
		callbackName = s.jsonpCallback = jQuery.isFunction( s.jsonpCallback ) ?
			s.jsonpCallback() :
			s.jsonpCallback;

		// Insert callback into url or form data
		if ( jsonProp ) {
			s[ jsonProp ] = s[ jsonProp ].replace( rjsonp, "$1" + callbackName );
		} else if ( s.jsonp !== false ) {
			s.url += ( rquery.test( s.url ) ? "&" : "?" ) + s.jsonp + "=" + callbackName;
		}

		// Use data converter to retrieve json after script execution
		s.converters["script json"] = function() {
			if ( !responseContainer ) {
				jQuery.error( callbackName + " was not called" );
			}
			return responseContainer[ 0 ];
		};

		// force json dataType
		s.dataTypes[ 0 ] = "json";

		// Install callback
		overwritten = window[ callbackName ];
		window[ callbackName ] = function() {
			responseContainer = arguments;
		};

		// Clean-up function (fires after converters)
		jqXHR.always(function() {
			// Restore preexisting value
			window[ callbackName ] = overwritten;

			// Save back as free
			if ( s[ callbackName ] ) {
				// make sure that re-using the options doesn't screw things around
				s.jsonpCallback = originalSettings.jsonpCallback;

				// save the callback name for future use
				oldCallbacks.push( callbackName );
			}

			// Call if it was a function and we have a response
			if ( responseContainer && jQuery.isFunction( overwritten ) ) {
				overwritten( responseContainer[ 0 ] );
			}

			responseContainer = overwritten = undefined;
		});

		// Delegate to script
		return "script";
	}
});




// data: string of html
// context (optional): If specified, the fragment will be created in this context, defaults to document
// keepScripts (optional): If true, will include scripts passed in the html string
jQuery.parseHTML = function( data, context, keepScripts ) {
	if ( !data || typeof data !== "string" ) {
		return null;
	}
	if ( typeof context === "boolean" ) {
		keepScripts = context;
		context = false;
	}
	context = context || document;

	var parsed = rsingleTag.exec( data ),
		scripts = !keepScripts && [];

	// Single tag
	if ( parsed ) {
		return [ context.createElement( parsed[1] ) ];
	}

	parsed = jQuery.buildFragment( [ data ], context, scripts );

	if ( scripts && scripts.length ) {
		jQuery( scripts ).remove();
	}

	return jQuery.merge( [], parsed.childNodes );
};


// Keep a copy of the old load method
var _load = jQuery.fn.load;

/**
 * Load a url into a page
 */
jQuery.fn.load = function( url, params, callback ) {
	if ( typeof url !== "string" && _load ) {
		return _load.apply( this, arguments );
	}

	var selector, type, response,
		self = this,
		off = url.indexOf(" ");

	if ( off >= 0 ) {
		selector = jQuery.trim( url.slice( off ) );
		url = url.slice( 0, off );
	}

	// If it's a function
	if ( jQuery.isFunction( params ) ) {

		// We assume that it's the callback
		callback = params;
		params = undefined;

	// Otherwise, build a param string
	} else if ( params && typeof params === "object" ) {
		type = "POST";
	}

	// If we have elements to modify, make the request
	if ( self.length > 0 ) {
		jQuery.ajax({
			url: url,

			// if "type" variable is undefined, then "GET" method will be used
			type: type,
			dataType: "html",
			data: params
		}).done(function( responseText ) {

			// Save response for use in complete callback
			response = arguments;

			self.html( selector ?

				// If a selector was specified, locate the right elements in a dummy div
				// Exclude scripts to avoid IE 'Permission Denied' errors
				jQuery("<div>").append( jQuery.parseHTML( responseText ) ).find( selector ) :

				// Otherwise use the full result
				responseText );

		}).complete( callback && function( jqXHR, status ) {
			self.each( callback, response || [ jqXHR.responseText, status, jqXHR ] );
		});
	}

	return this;
};




jQuery.expr.filters.animated = function( elem ) {
	return jQuery.grep(jQuery.timers, function( fn ) {
		return elem === fn.elem;
	}).length;
};




var docElem = window.document.documentElement;

/**
 * Gets a window from an element
 */
function getWindow( elem ) {
	return jQuery.isWindow( elem ) ? elem : elem.nodeType === 9 && elem.defaultView;
}

jQuery.offset = {
	setOffset: function( elem, options, i ) {
		var curPosition, curLeft, curCSSTop, curTop, curOffset, curCSSLeft, calculatePosition,
			position = jQuery.css( elem, "position" ),
			curElem = jQuery( elem ),
			props = {};

		// Set position first, in-case top/left are set even on static elem
		if ( position === "static" ) {
			elem.style.position = "relative";
		}

		curOffset = curElem.offset();
		curCSSTop = jQuery.css( elem, "top" );
		curCSSLeft = jQuery.css( elem, "left" );
		calculatePosition = ( position === "absolute" || position === "fixed" ) &&
			( curCSSTop + curCSSLeft ).indexOf("auto") > -1;

		// Need to be able to calculate position if either top or left is auto and position is either absolute or fixed
		if ( calculatePosition ) {
			curPosition = curElem.position();
			curTop = curPosition.top;
			curLeft = curPosition.left;

		} else {
			curTop = parseFloat( curCSSTop ) || 0;
			curLeft = parseFloat( curCSSLeft ) || 0;
		}

		if ( jQuery.isFunction( options ) ) {
			options = options.call( elem, i, curOffset );
		}

		if ( options.top != null ) {
			props.top = ( options.top - curOffset.top ) + curTop;
		}
		if ( options.left != null ) {
			props.left = ( options.left - curOffset.left ) + curLeft;
		}

		if ( "using" in options ) {
			options.using.call( elem, props );

		} else {
			curElem.css( props );
		}
	}
};

jQuery.fn.extend({
	offset: function( options ) {
		if ( arguments.length ) {
			return options === undefined ?
				this :
				this.each(function( i ) {
					jQuery.offset.setOffset( this, options, i );
				});
		}

		var docElem, win,
			elem = this[ 0 ],
			box = { top: 0, left: 0 },
			doc = elem && elem.ownerDocument;

		if ( !doc ) {
			return;
		}

		docElem = doc.documentElement;

		// Make sure it's not a disconnected DOM node
		if ( !jQuery.contains( docElem, elem ) ) {
			return box;
		}

		// If we don't have gBCR, just use 0,0 rather than error
		// BlackBerry 5, iOS 3 (original iPhone)
		if ( typeof elem.getBoundingClientRect !== strundefined ) {
			box = elem.getBoundingClientRect();
		}
		win = getWindow( doc );
		return {
			top: box.top + win.pageYOffset - docElem.clientTop,
			left: box.left + win.pageXOffset - docElem.clientLeft
		};
	},

	position: function() {
		if ( !this[ 0 ] ) {
			return;
		}

		var offsetParent, offset,
			elem = this[ 0 ],
			parentOffset = { top: 0, left: 0 };

		// Fixed elements are offset from window (parentOffset = {top:0, left: 0}, because it is its only offset parent
		if ( jQuery.css( elem, "position" ) === "fixed" ) {
			// We assume that getBoundingClientRect is available when computed position is fixed
			offset = elem.getBoundingClientRect();

		} else {
			// Get *real* offsetParent
			offsetParent = this.offsetParent();

			// Get correct offsets
			offset = this.offset();
			if ( !jQuery.nodeName( offsetParent[ 0 ], "html" ) ) {
				parentOffset = offsetParent.offset();
			}

			// Add offsetParent borders
			parentOffset.top += jQuery.css( offsetParent[ 0 ], "borderTopWidth", true );
			parentOffset.left += jQuery.css( offsetParent[ 0 ], "borderLeftWidth", true );
		}

		// Subtract parent offsets and element margins
		return {
			top: offset.top - parentOffset.top - jQuery.css( elem, "marginTop", true ),
			left: offset.left - parentOffset.left - jQuery.css( elem, "marginLeft", true )
		};
	},

	offsetParent: function() {
		return this.map(function() {
			var offsetParent = this.offsetParent || docElem;

			while ( offsetParent && ( !jQuery.nodeName( offsetParent, "html" ) && jQuery.css( offsetParent, "position" ) === "static" ) ) {
				offsetParent = offsetParent.offsetParent;
			}

			return offsetParent || docElem;
		});
	}
});

// Create scrollLeft and scrollTop methods
jQuery.each( { scrollLeft: "pageXOffset", scrollTop: "pageYOffset" }, function( method, prop ) {
	var top = "pageYOffset" === prop;

	jQuery.fn[ method ] = function( val ) {
		return access( this, function( elem, method, val ) {
			var win = getWindow( elem );

			if ( val === undefined ) {
				return win ? win[ prop ] : elem[ method ];
			}

			if ( win ) {
				win.scrollTo(
					!top ? val : window.pageXOffset,
					top ? val : window.pageYOffset
				);

			} else {
				elem[ method ] = val;
			}
		}, method, val, arguments.length, null );
	};
});

// Add the top/left cssHooks using jQuery.fn.position
// Webkit bug: https://bugs.webkit.org/show_bug.cgi?id=29084
// getComputedStyle returns percent when specified for top/left/bottom/right
// rather than make the css module depend on the offset module, we just check for it here
jQuery.each( [ "top", "left" ], function( i, prop ) {
	jQuery.cssHooks[ prop ] = addGetHookIf( support.pixelPosition,
		function( elem, computed ) {
			if ( computed ) {
				computed = curCSS( elem, prop );
				// if curCSS returns percentage, fallback to offset
				return rnumnonpx.test( computed ) ?
					jQuery( elem ).position()[ prop ] + "px" :
					computed;
			}
		}
	);
});


// Create innerHeight, innerWidth, height, width, outerHeight and outerWidth methods
jQuery.each( { Height: "height", Width: "width" }, function( name, type ) {
	jQuery.each( { padding: "inner" + name, content: type, "": "outer" + name }, function( defaultExtra, funcName ) {
		// margin is only for outerHeight, outerWidth
		jQuery.fn[ funcName ] = function( margin, value ) {
			var chainable = arguments.length && ( defaultExtra || typeof margin !== "boolean" ),
				extra = defaultExtra || ( margin === true || value === true ? "margin" : "border" );

			return access( this, function( elem, type, value ) {
				var doc;

				if ( jQuery.isWindow( elem ) ) {
					// As of 5/8/2012 this will yield incorrect results for Mobile Safari, but there
					// isn't a whole lot we can do. See pull request at this URL for discussion:
					// https://github.com/jquery/jquery/pull/764
					return elem.document.documentElement[ "client" + name ];
				}

				// Get document width or height
				if ( elem.nodeType === 9 ) {
					doc = elem.documentElement;

					// Either scroll[Width/Height] or offset[Width/Height] or client[Width/Height],
					// whichever is greatest
					return Math.max(
						elem.body[ "scroll" + name ], doc[ "scroll" + name ],
						elem.body[ "offset" + name ], doc[ "offset" + name ],
						doc[ "client" + name ]
					);
				}

				return value === undefined ?
					// Get width or height on the element, requesting but not forcing parseFloat
					jQuery.css( elem, type, extra ) :

					// Set width or height on the element
					jQuery.style( elem, type, value, extra );
			}, type, chainable ? margin : undefined, chainable, null );
		};
	});
});


// The number of elements contained in the matched element set
jQuery.fn.size = function() {
	return this.length;
};

jQuery.fn.andSelf = jQuery.fn.addBack;




// Register as a named AMD module, since jQuery can be concatenated with other
// files that may use define, but not via a proper concatenation script that
// understands anonymous AMD modules. A named AMD is safest and most robust
// way to register. Lowercase jquery is used because AMD module names are
// derived from file names, and jQuery is normally delivered in a lowercase
// file name. Do this after creating the global so that if an AMD module wants
// to call noConflict to hide this version of jQuery, it will work.

// Note that for maximum portability, libraries that are not jQuery should
// declare themselves as anonymous modules, and avoid setting a global if an
// AMD loader is present. jQuery is a special case. For more information, see
// https://github.com/jrburke/requirejs/wiki/Updating-existing-libraries#wiki-anon

if ( typeof define === "function" && define.amd ) {
	define( "jquery", [], function() {
		return jQuery;
	});
}




var
	// Map over jQuery in case of overwrite
	_jQuery = window.jQuery,

	// Map over the $ in case of overwrite
	_$ = window.$;

jQuery.noConflict = function( deep ) {
	if ( window.$ === jQuery ) {
		window.$ = _$;
	}

	if ( deep && window.jQuery === jQuery ) {
		window.jQuery = _jQuery;
	}

	return jQuery;
};

// Expose jQuery and $ identifiers, even in
// AMD (#7102#comment:10, https://github.com/jquery/jquery/pull/557)
// and CommonJS for browser emulators (#13566)
if ( typeof noGlobal === strundefined ) {
	window.jQuery = window.$ = jQuery;
}




return jQuery;

}));

},{}],21:[function(require,module,exports){
module.exports={
  "resourceType": "Conformance",
  "text": {
    "status": "generated",
    "div": "<div><h2>Base FHIR Conformance Statement (Full)</h2><p>This is the base conformance statement for FHIR. It represents a server that provides the full set of functionality defined by FHIR. It is provided to use as a template for system designers to build their own conformance statements from</p><table><tr><td>Mode</td><td>server</td></tr><tr><td>Description</td><td>All the functionality defined in FHIR</td></tr><tr><td>Transaction</td><td>y</td></tr><tr><td>System History</td><td>y</td></tr><tr><td>System Search</td><td>y</td></tr></table><table><tr><th><b>Resource Type</b></th><th><b>Profile</b></th><th><b>Read</b></th><th><b>V-Read</b></th><th><b>Search</b></th><th><b>Update</b></th><th><b>Updates</b></th><th><b>Create</b></th><th><b>Delete</b></th><th><b>History</b></th></tr><tr><td>AdverseReaction</td><td><a href=\"http://hl7.org/fhir/AdverseReaction\">http://hl7.org/fhir/AdverseReaction</a></td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td></tr><tr><td>Alert</td><td><a href=\"http://hl7.org/fhir/Alert\">http://hl7.org/fhir/Alert</a></td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td></tr><tr><td>AllergyIntolerance</td><td><a href=\"http://hl7.org/fhir/AllergyIntolerance\">http://hl7.org/fhir/AllergyIntolerance</a></td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td></tr><tr><td>Appointment</td><td><a href=\"http://hl7.org/fhir/Appointment\">http://hl7.org/fhir/Appointment</a></td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td></tr><tr><td>AppointmentResponse</td><td><a href=\"http://hl7.org/fhir/AppointmentResponse\">http://hl7.org/fhir/AppointmentResponse</a></td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td></tr><tr><td>Availability</td><td><a href=\"http://hl7.org/fhir/Availability\">http://hl7.org/fhir/Availability</a></td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td></tr><tr><td>CarePlan</td><td><a href=\"http://hl7.org/fhir/CarePlan\">http://hl7.org/fhir/CarePlan</a></td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td></tr><tr><td>Composition</td><td><a href=\"http://hl7.org/fhir/Composition\">http://hl7.org/fhir/Composition</a></td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td></tr><tr><td>ConceptMap</td><td><a href=\"http://hl7.org/fhir/ConceptMap\">http://hl7.org/fhir/ConceptMap</a></td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td></tr><tr><td>Condition</td><td><a href=\"http://hl7.org/fhir/Condition\">http://hl7.org/fhir/Condition</a></td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td></tr><tr><td>Conformance</td><td><a href=\"http://hl7.org/fhir/Conformance\">http://hl7.org/fhir/Conformance</a></td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td></tr><tr><td>Device</td><td><a href=\"http://hl7.org/fhir/Device\">http://hl7.org/fhir/Device</a></td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td></tr><tr><td>DeviceObservationReport</td><td><a href=\"http://hl7.org/fhir/DeviceObservationReport\">http://hl7.org/fhir/DeviceObservationReport</a></td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td></tr><tr><td>DiagnosticOrder</td><td><a href=\"http://hl7.org/fhir/DiagnosticOrder\">http://hl7.org/fhir/DiagnosticOrder</a></td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td></tr><tr><td>DiagnosticReport</td><td><a href=\"http://hl7.org/fhir/DiagnosticReport\">http://hl7.org/fhir/DiagnosticReport</a></td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td></tr><tr><td>DocumentManifest</td><td><a href=\"http://hl7.org/fhir/DocumentManifest\">http://hl7.org/fhir/DocumentManifest</a></td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td></tr><tr><td>DocumentReference</td><td><a href=\"http://hl7.org/fhir/DocumentReference\">http://hl7.org/fhir/DocumentReference</a></td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td></tr><tr><td>Encounter</td><td><a href=\"http://hl7.org/fhir/Encounter\">http://hl7.org/fhir/Encounter</a></td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td></tr><tr><td>FamilyHistory</td><td><a href=\"http://hl7.org/fhir/FamilyHistory\">http://hl7.org/fhir/FamilyHistory</a></td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td></tr><tr><td>Group</td><td><a href=\"http://hl7.org/fhir/Group\">http://hl7.org/fhir/Group</a></td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td></tr><tr><td>ImagingStudy</td><td><a href=\"http://hl7.org/fhir/ImagingStudy\">http://hl7.org/fhir/ImagingStudy</a></td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td></tr><tr><td>Immunization</td><td><a href=\"http://hl7.org/fhir/Immunization\">http://hl7.org/fhir/Immunization</a></td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td></tr><tr><td>ImmunizationRecommendation</td><td><a href=\"http://hl7.org/fhir/ImmunizationRecommendation\">http://hl7.org/fhir/ImmunizationRecommendation</a></td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td></tr><tr><td>List</td><td><a href=\"http://hl7.org/fhir/List\">http://hl7.org/fhir/List</a></td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td></tr><tr><td>Location</td><td><a href=\"http://hl7.org/fhir/Location\">http://hl7.org/fhir/Location</a></td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td></tr><tr><td>Media</td><td><a href=\"http://hl7.org/fhir/Media\">http://hl7.org/fhir/Media</a></td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td></tr><tr><td>Medication</td><td><a href=\"http://hl7.org/fhir/Medication\">http://hl7.org/fhir/Medication</a></td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td></tr><tr><td>MedicationAdministration</td><td><a href=\"http://hl7.org/fhir/MedicationAdministration\">http://hl7.org/fhir/MedicationAdministration</a></td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td></tr><tr><td>MedicationDispense</td><td><a href=\"http://hl7.org/fhir/MedicationDispense\">http://hl7.org/fhir/MedicationDispense</a></td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td></tr><tr><td>MedicationPrescription</td><td><a href=\"http://hl7.org/fhir/MedicationPrescription\">http://hl7.org/fhir/MedicationPrescription</a></td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td></tr><tr><td>MedicationStatement</td><td><a href=\"http://hl7.org/fhir/MedicationStatement\">http://hl7.org/fhir/MedicationStatement</a></td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td></tr><tr><td>MessageHeader</td><td><a href=\"http://hl7.org/fhir/MessageHeader\">http://hl7.org/fhir/MessageHeader</a></td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td></tr><tr><td>Namespace</td><td><a href=\"http://hl7.org/fhir/Namespace\">http://hl7.org/fhir/Namespace</a></td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td></tr><tr><td>Observation</td><td><a href=\"http://hl7.org/fhir/Observation\">http://hl7.org/fhir/Observation</a></td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td></tr><tr><td>OperationOutcome</td><td><a href=\"http://hl7.org/fhir/OperationOutcome\">http://hl7.org/fhir/OperationOutcome</a></td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td></tr><tr><td>Order</td><td><a href=\"http://hl7.org/fhir/Order\">http://hl7.org/fhir/Order</a></td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td></tr><tr><td>OrderResponse</td><td><a href=\"http://hl7.org/fhir/OrderResponse\">http://hl7.org/fhir/OrderResponse</a></td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td></tr><tr><td>Organization</td><td><a href=\"http://hl7.org/fhir/Organization\">http://hl7.org/fhir/Organization</a></td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td></tr><tr><td>Other</td><td><a href=\"http://hl7.org/fhir/Other\">http://hl7.org/fhir/Other</a></td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td></tr><tr><td>Patient</td><td><a href=\"http://hl7.org/fhir/Patient\">http://hl7.org/fhir/Patient</a></td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td></tr><tr><td>Practitioner</td><td><a href=\"http://hl7.org/fhir/Practitioner\">http://hl7.org/fhir/Practitioner</a></td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td></tr><tr><td>Procedure</td><td><a href=\"http://hl7.org/fhir/Procedure\">http://hl7.org/fhir/Procedure</a></td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td></tr><tr><td>Profile</td><td><a href=\"http://hl7.org/fhir/Profile\">http://hl7.org/fhir/Profile</a></td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td></tr><tr><td>Provenance</td><td><a href=\"http://hl7.org/fhir/Provenance\">http://hl7.org/fhir/Provenance</a></td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td></tr><tr><td>Query</td><td><a href=\"http://hl7.org/fhir/Query\">http://hl7.org/fhir/Query</a></td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td></tr><tr><td>Questionnaire</td><td><a href=\"http://hl7.org/fhir/Questionnaire\">http://hl7.org/fhir/Questionnaire</a></td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td></tr><tr><td>RelatedPerson</td><td><a href=\"http://hl7.org/fhir/RelatedPerson\">http://hl7.org/fhir/RelatedPerson</a></td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td></tr><tr><td>SecurityEvent</td><td><a href=\"http://hl7.org/fhir/SecurityEvent\">http://hl7.org/fhir/SecurityEvent</a></td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td></tr><tr><td>Slot</td><td><a href=\"http://hl7.org/fhir/Slot\">http://hl7.org/fhir/Slot</a></td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td></tr><tr><td>Specimen</td><td><a href=\"http://hl7.org/fhir/Specimen\">http://hl7.org/fhir/Specimen</a></td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td></tr><tr><td>Substance</td><td><a href=\"http://hl7.org/fhir/Substance\">http://hl7.org/fhir/Substance</a></td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td></tr><tr><td>Supply</td><td><a href=\"http://hl7.org/fhir/Supply\">http://hl7.org/fhir/Supply</a></td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td></tr><tr><td>ValueSet</td><td><a href=\"http://hl7.org/fhir/ValueSet\">http://hl7.org/fhir/ValueSet</a></td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td><td>y</td></tr></table></div>"
  },
  "identifier": "http://hl7.org/fhir/conformance-base",
  "version": "0.1.0-????",
  "name": "Base FHIR Conformance Statement (Full)",
  "publisher": "FHIR Project Team",
  "telecom": [
    {
      "system": "url",
      "value": "http://hl7.org/fhir"
    }
  ],
  "description": "This is the base conformance statement for FHIR. It represents a server that provides the full set of functionality defined by FHIR. It is provided to use as a template for system designers to build their own conformance statements from",
  "status": "draft",
  "date": "2014-04-28T17:37:56.075-00:00",
  "fhirVersion": "0.1.0",
  "acceptUnknown": false,
  "format": [
    "xml",
    "json"
  ],
  "rest": [
    {
      "mode": "server",
      "documentation": "All the functionality defined in FHIR",
      "resource": [
        {
          "type": "AdverseReaction",
          "profile": {
            "reference": "http://hl7.org/fhir/AdverseReaction"
          },
          "operation": [
            {
              "code": "read"
            },
            {
              "code": "vread"
            },
            {
              "code": "update"
            },
            {
              "code": "delete"
            },
            {
              "code": "history-instance"
            },
            {
              "code": "validate"
            },
            {
              "code": "history-type"
            },
            {
              "code": "create"
            },
            {
              "code": "search-type"
            }
          ],
          "searchParam": [
            {
              "name": "substance",
              "definition": "http://hl7.org/fhir/profiles/AdverseReaction",
              "type": "reference",
              "documentation": "The name or code of the substance that produces the sensitivity"
            },
            {
              "name": "_id",
              "definition": "http://hl7.org/fhir/profiles/AdverseReaction",
              "type": "token",
              "documentation": "The logical resource id associated with the resource (must be supported by all servers)"
            },
            {
              "name": "subject",
              "definition": "http://hl7.org/fhir/profiles/AdverseReaction",
              "type": "reference",
              "documentation": "The subject that the sensitivity is about"
            },
            {
              "name": "_language",
              "definition": "http://hl7.org/fhir/profiles/AdverseReaction",
              "type": "token",
              "documentation": "The stated language of the resource"
            },
            {
              "name": "date",
              "definition": "http://hl7.org/fhir/profiles/AdverseReaction",
              "type": "date",
              "documentation": "The date of the reaction"
            },
            {
              "name": "symptom",
              "definition": "http://hl7.org/fhir/profiles/AdverseReaction",
              "type": "token",
              "documentation": "One of the symptoms of the reaction"
            }
          ]
        },
        {
          "type": "Alert",
          "profile": {
            "reference": "http://hl7.org/fhir/Alert"
          },
          "operation": [
            {
              "code": "read"
            },
            {
              "code": "vread"
            },
            {
              "code": "update"
            },
            {
              "code": "delete"
            },
            {
              "code": "history-instance"
            },
            {
              "code": "validate"
            },
            {
              "code": "history-type"
            },
            {
              "code": "create"
            },
            {
              "code": "search-type"
            }
          ],
          "searchParam": [
            {
              "name": "_id",
              "definition": "http://hl7.org/fhir/profiles/Alert",
              "type": "token",
              "documentation": "The logical resource id associated with the resource (must be supported by all servers)"
            },
            {
              "name": "subject",
              "definition": "http://hl7.org/fhir/profiles/Alert",
              "type": "reference",
              "documentation": "The identity of a subject to list alerts for"
            },
            {
              "name": "_language",
              "definition": "http://hl7.org/fhir/profiles/Alert",
              "type": "token",
              "documentation": "The stated language of the resource"
            }
          ]
        },
        {
          "type": "AllergyIntolerance",
          "profile": {
            "reference": "http://hl7.org/fhir/AllergyIntolerance"
          },
          "operation": [
            {
              "code": "read"
            },
            {
              "code": "vread"
            },
            {
              "code": "update"
            },
            {
              "code": "delete"
            },
            {
              "code": "history-instance"
            },
            {
              "code": "validate"
            },
            {
              "code": "history-type"
            },
            {
              "code": "create"
            },
            {
              "code": "search-type"
            }
          ],
          "searchParam": [
            {
              "name": "substance",
              "definition": "http://hl7.org/fhir/profiles/AllergyIntolerance",
              "type": "reference",
              "documentation": "The name or code of the substance that produces the sensitivity"
            },
            {
              "name": "_id",
              "definition": "http://hl7.org/fhir/profiles/AllergyIntolerance",
              "type": "token",
              "documentation": "The logical resource id associated with the resource (must be supported by all servers)"
            },
            {
              "name": "status",
              "definition": "http://hl7.org/fhir/profiles/AllergyIntolerance",
              "type": "token",
              "documentation": "The status of the sensitivity"
            },
            {
              "name": "recorder",
              "definition": "http://hl7.org/fhir/profiles/AllergyIntolerance",
              "type": "reference",
              "documentation": "Who recorded the sensitivity"
            },
            {
              "name": "subject",
              "definition": "http://hl7.org/fhir/profiles/AllergyIntolerance",
              "type": "reference",
              "documentation": "The subject that the sensitivity is about"
            },
            {
              "name": "_language",
              "definition": "http://hl7.org/fhir/profiles/AllergyIntolerance",
              "type": "token",
              "documentation": "The stated language of the resource"
            },
            {
              "name": "date",
              "definition": "http://hl7.org/fhir/profiles/AllergyIntolerance",
              "type": "date",
              "documentation": "Recorded date/time."
            },
            {
              "name": "type",
              "definition": "http://hl7.org/fhir/profiles/AllergyIntolerance",
              "type": "token",
              "documentation": "The type of sensitivity"
            }
          ]
        },
        {
          "type": "Appointment",
          "profile": {
            "reference": "http://hl7.org/fhir/Appointment"
          },
          "operation": [
            {
              "code": "read"
            },
            {
              "code": "vread"
            },
            {
              "code": "update"
            },
            {
              "code": "delete"
            },
            {
              "code": "history-instance"
            },
            {
              "code": "validate"
            },
            {
              "code": "history-type"
            },
            {
              "code": "create"
            },
            {
              "code": "search-type"
            }
          ],
          "searchParam": [
            {
              "name": "partstatus",
              "definition": "http://hl7.org/fhir/profiles/Appointment",
              "type": "token",
              "documentation": "The Participation status of the subject, or other participant on the appointment"
            },
            {
              "name": "individual",
              "definition": "http://hl7.org/fhir/profiles/Appointment",
              "type": "reference",
              "documentation": "Any one of the individuals participating in the appointment"
            },
            {
              "name": "_id",
              "definition": "http://hl7.org/fhir/profiles/Appointment",
              "type": "token",
              "documentation": "The logical resource id associated with the resource (must be supported by all servers)"
            },
            {
              "name": "status",
              "definition": "http://hl7.org/fhir/profiles/Appointment",
              "type": "string",
              "documentation": "The overall status of the appointment"
            },
            {
              "name": "_language",
              "definition": "http://hl7.org/fhir/profiles/Appointment",
              "type": "token",
              "documentation": "The stated language of the resource"
            },
            {
              "name": "date",
              "definition": "http://hl7.org/fhir/profiles/Appointment",
              "type": "date",
              "documentation": "Appointment date/time."
            }
          ]
        },
        {
          "type": "AppointmentResponse",
          "profile": {
            "reference": "http://hl7.org/fhir/AppointmentResponse"
          },
          "operation": [
            {
              "code": "read"
            },
            {
              "code": "vread"
            },
            {
              "code": "update"
            },
            {
              "code": "delete"
            },
            {
              "code": "history-instance"
            },
            {
              "code": "validate"
            },
            {
              "code": "history-type"
            },
            {
              "code": "create"
            },
            {
              "code": "search-type"
            }
          ],
          "searchParam": [
            {
              "name": "partstatus",
              "definition": "http://hl7.org/fhir/profiles/AppointmentResponse",
              "type": "string",
              "documentation": "The overall status of the appointment"
            },
            {
              "name": "_id",
              "definition": "http://hl7.org/fhir/profiles/AppointmentResponse",
              "type": "token",
              "documentation": "The logical resource id associated with the resource (must be supported by all servers)"
            },
            {
              "name": "subject",
              "definition": "http://hl7.org/fhir/profiles/AppointmentResponse",
              "type": "reference",
              "documentation": "The subject that the appointment response replies for"
            },
            {
              "name": "_language",
              "definition": "http://hl7.org/fhir/profiles/AppointmentResponse",
              "type": "token",
              "documentation": "The stated language of the resource"
            },
            {
              "name": "appointment",
              "definition": "http://hl7.org/fhir/profiles/AppointmentResponse",
              "type": "reference",
              "documentation": "The appointment that the response is attached to"
            }
          ]
        },
        {
          "type": "Availability",
          "profile": {
            "reference": "http://hl7.org/fhir/Availability"
          },
          "operation": [
            {
              "code": "read"
            },
            {
              "code": "vread"
            },
            {
              "code": "update"
            },
            {
              "code": "delete"
            },
            {
              "code": "history-instance"
            },
            {
              "code": "validate"
            },
            {
              "code": "history-type"
            },
            {
              "code": "create"
            },
            {
              "code": "search-type"
            }
          ],
          "searchParam": [
            {
              "name": "individual",
              "definition": "http://hl7.org/fhir/profiles/Availability",
              "type": "reference",
              "documentation": "The individual to find an availability for"
            },
            {
              "name": "_id",
              "definition": "http://hl7.org/fhir/profiles/Availability",
              "type": "token",
              "documentation": "The logical resource id associated with the resource (must be supported by all servers)"
            },
            {
              "name": "_language",
              "definition": "http://hl7.org/fhir/profiles/Availability",
              "type": "token",
              "documentation": "The stated language of the resource"
            },
            {
              "name": "date",
              "definition": "http://hl7.org/fhir/profiles/Availability",
              "type": "date",
              "documentation": "Search for availability resources that have a period that contains this date specified"
            },
            {
              "name": "type",
              "definition": "http://hl7.org/fhir/profiles/Availability",
              "type": "token",
              "documentation": "The type of appointments that can be booked into associated slot(s)"
            }
          ]
        },
        {
          "type": "CarePlan",
          "profile": {
            "reference": "http://hl7.org/fhir/CarePlan"
          },
          "operation": [
            {
              "code": "read"
            },
            {
              "code": "vread"
            },
            {
              "code": "update"
            },
            {
              "code": "delete"
            },
            {
              "code": "history-instance"
            },
            {
              "code": "validate"
            },
            {
              "code": "history-type"
            },
            {
              "code": "create"
            },
            {
              "code": "search-type"
            }
          ],
          "searchParam": [
            {
              "name": "activitycode",
              "definition": "http://hl7.org/fhir/profiles/CarePlan",
              "type": "token",
              "documentation": "Detail type of activity"
            },
            {
              "name": "patient",
              "definition": "http://hl7.org/fhir/profiles/CarePlan",
              "type": "reference",
              "documentation": "Who care plan is for"
            },
            {
              "name": "_id",
              "definition": "http://hl7.org/fhir/profiles/CarePlan",
              "type": "token",
              "documentation": "The logical resource id associated with the resource (must be supported by all servers)"
            },
            {
              "name": "condition",
              "definition": "http://hl7.org/fhir/profiles/CarePlan",
              "type": "reference",
              "documentation": "Health issues this plan addresses"
            },
            {
              "name": "activitydetail",
              "definition": "http://hl7.org/fhir/profiles/CarePlan",
              "type": "reference",
              "documentation": "Activity details defined in specific resource"
            },
            {
              "name": "activitydate",
              "definition": "http://hl7.org/fhir/profiles/CarePlan",
              "type": "date",
              "documentation": "Specified date occurs within period specified by CarePlan.activity.timingSchedule"
            },
            {
              "name": "participant",
              "definition": "http://hl7.org/fhir/profiles/CarePlan",
              "type": "reference",
              "documentation": "Who is involved"
            },
            {
              "name": "_language",
              "definition": "http://hl7.org/fhir/profiles/CarePlan",
              "type": "token",
              "documentation": "The stated language of the resource"
            },
            {
              "name": "date",
              "definition": "http://hl7.org/fhir/profiles/CarePlan",
              "type": "date",
              "documentation": "Time period plan covers"
            }
          ]
        },
        {
          "type": "Composition",
          "profile": {
            "reference": "http://hl7.org/fhir/Composition"
          },
          "operation": [
            {
              "code": "read"
            },
            {
              "code": "vread"
            },
            {
              "code": "update"
            },
            {
              "code": "delete"
            },
            {
              "code": "history-instance"
            },
            {
              "code": "validate"
            },
            {
              "code": "history-type"
            },
            {
              "code": "create"
            },
            {
              "code": "search-type"
            }
          ],
          "searchParam": [
            {
              "name": "author",
              "definition": "http://hl7.org/fhir/profiles/Composition",
              "type": "reference",
              "documentation": "Who and/or what authored the composition"
            },
            {
              "name": "_id",
              "definition": "http://hl7.org/fhir/profiles/Composition",
              "type": "token",
              "documentation": "The logical resource id associated with the resource (must be supported by all servers)"
            },
            {
              "name": "attester",
              "definition": "http://hl7.org/fhir/profiles/Composition",
              "type": "reference",
              "documentation": "Who attested the composition"
            },
            {
              "name": "subject",
              "definition": "http://hl7.org/fhir/profiles/Composition",
              "type": "reference",
              "documentation": "Who and/or what the composition is about"
            },
            {
              "name": "section-content",
              "definition": "http://hl7.org/fhir/profiles/Composition",
              "type": "reference",
              "documentation": "The actual data for the section"
            },
            {
              "name": "context",
              "definition": "http://hl7.org/fhir/profiles/Composition",
              "type": "token",
              "documentation": "Code(s) that apply to the event being documented"
            },
            {
              "name": "class",
              "definition": "http://hl7.org/fhir/profiles/Composition",
              "type": "token",
              "documentation": "Categorization of Composition"
            },
            {
              "name": "_language",
              "definition": "http://hl7.org/fhir/profiles/Composition",
              "type": "token",
              "documentation": "The stated language of the resource"
            },
            {
              "name": "section-type",
              "definition": "http://hl7.org/fhir/profiles/Composition",
              "type": "token",
              "documentation": "Classification of section (recommended)"
            },
            {
              "name": "date",
              "definition": "http://hl7.org/fhir/profiles/Composition",
              "type": "date",
              "documentation": "Composition editing time"
            },
            {
              "name": "type",
              "definition": "http://hl7.org/fhir/profiles/Composition",
              "type": "token",
              "documentation": "Kind of composition (LOINC if possible)"
            },
            {
              "name": "identifier",
              "definition": "http://hl7.org/fhir/profiles/Composition",
              "type": "token",
              "documentation": "Logical identifier of composition (version-independent)"
            }
          ]
        },
        {
          "type": "ConceptMap",
          "profile": {
            "reference": "http://hl7.org/fhir/ConceptMap"
          },
          "operation": [
            {
              "code": "read"
            },
            {
              "code": "vread"
            },
            {
              "code": "update"
            },
            {
              "code": "delete"
            },
            {
              "code": "history-instance"
            },
            {
              "code": "validate"
            },
            {
              "code": "history-type"
            },
            {
              "code": "create"
            },
            {
              "code": "search-type"
            }
          ],
          "searchParam": [
            {
              "name": "dependson",
              "definition": "http://hl7.org/fhir/profiles/ConceptMap",
              "type": "token",
              "documentation": "Reference to element/field/valueset provides the context"
            },
            {
              "name": "status",
              "definition": "http://hl7.org/fhir/profiles/ConceptMap",
              "type": "token",
              "documentation": "Status of the concept map"
            },
            {
              "name": "date",
              "definition": "http://hl7.org/fhir/profiles/ConceptMap",
              "type": "date",
              "documentation": "The concept map publication date"
            },
            {
              "name": "version",
              "definition": "http://hl7.org/fhir/profiles/ConceptMap",
              "type": "token",
              "documentation": "The version identifier of the concept map"
            },
            {
              "name": "publisher",
              "definition": "http://hl7.org/fhir/profiles/ConceptMap",
              "type": "string",
              "documentation": "Name of the publisher of the concept map"
            },
            {
              "name": "product",
              "definition": "http://hl7.org/fhir/profiles/ConceptMap",
              "type": "token",
              "documentation": "Reference to element/field/valueset provides the context"
            },
            {
              "name": "system",
              "definition": "http://hl7.org/fhir/profiles/ConceptMap",
              "type": "token",
              "documentation": "The system for any destination concepts mapped by this map"
            },
            {
              "name": "_id",
              "definition": "http://hl7.org/fhir/profiles/ConceptMap",
              "type": "token",
              "documentation": "The logical resource id associated with the resource (must be supported by all servers)"
            },
            {
              "name": "source",
              "definition": "http://hl7.org/fhir/profiles/ConceptMap",
              "type": "reference",
              "documentation": "The system for any concepts mapped by this concept map"
            },
            {
              "name": "description",
              "definition": "http://hl7.org/fhir/profiles/ConceptMap",
              "type": "string",
              "documentation": "Text search in the description of the concept map"
            },
            {
              "name": "name",
              "definition": "http://hl7.org/fhir/profiles/ConceptMap",
              "type": "string",
              "documentation": "Name of the concept map"
            },
            {
              "name": "target",
              "definition": "http://hl7.org/fhir/profiles/ConceptMap",
              "type": "reference",
              "documentation": "Provides context to the mappings"
            },
            {
              "name": "_language",
              "definition": "http://hl7.org/fhir/profiles/ConceptMap",
              "type": "token",
              "documentation": "The stated language of the resource"
            },
            {
              "name": "identifier",
              "definition": "http://hl7.org/fhir/profiles/ConceptMap",
              "type": "token",
              "documentation": "The identifier of the concept map"
            }
          ]
        },
        {
          "type": "Condition",
          "profile": {
            "reference": "http://hl7.org/fhir/Condition"
          },
          "operation": [
            {
              "code": "read"
            },
            {
              "code": "vread"
            },
            {
              "code": "update"
            },
            {
              "code": "delete"
            },
            {
              "code": "history-instance"
            },
            {
              "code": "validate"
            },
            {
              "code": "history-type"
            },
            {
              "code": "create"
            },
            {
              "code": "search-type"
            }
          ],
          "searchParam": [
            {
              "name": "asserter",
              "definition": "http://hl7.org/fhir/profiles/Condition",
              "type": "reference",
              "documentation": "Person who asserts this condition"
            },
            {
              "name": "location",
              "definition": "http://hl7.org/fhir/profiles/Condition",
              "type": "token",
              "documentation": "Location - may include laterality"
            },
            {
              "name": "status",
              "definition": "http://hl7.org/fhir/profiles/Condition",
              "type": "token",
              "documentation": "The status of the condition"
            },
            {
              "name": "subject",
              "definition": "http://hl7.org/fhir/profiles/Condition",
              "type": "reference",
              "documentation": "Who has the condition?"
            },
            {
              "name": "onset",
              "definition": "http://hl7.org/fhir/profiles/Condition",
              "type": "date",
              "documentation": "When the Condition started (if started on a date)"
            },
            {
              "name": "evidence",
              "definition": "http://hl7.org/fhir/profiles/Condition",
              "type": "token",
              "documentation": "Manifestation/symptom"
            },
            {
              "name": "severity",
              "definition": "http://hl7.org/fhir/profiles/Condition",
              "type": "token",
              "documentation": "The severity of the condition"
            },
            {
              "name": "code",
              "definition": "http://hl7.org/fhir/profiles/Condition",
              "type": "token",
              "documentation": "Code for the condition"
            },
            {
              "name": "encounter",
              "definition": "http://hl7.org/fhir/profiles/Condition",
              "type": "reference",
              "documentation": "Encounter when condition first asserted"
            },
            {
              "name": "date-asserted",
              "definition": "http://hl7.org/fhir/profiles/Condition",
              "type": "date",
              "documentation": "When first detected/suspected/entered"
            },
            {
              "name": "stage",
              "definition": "http://hl7.org/fhir/profiles/Condition",
              "type": "token",
              "documentation": "Simple summary (disease specific)"
            },
            {
              "name": "related-code",
              "definition": "http://hl7.org/fhir/profiles/Condition",
              "type": "token",
              "documentation": "Relationship target by means of a predefined code"
            },
            {
              "name": "category",
              "definition": "http://hl7.org/fhir/profiles/Condition",
              "type": "token",
              "documentation": "The category of the condition"
            },
            {
              "name": "_id",
              "definition": "http://hl7.org/fhir/profiles/Condition",
              "type": "token",
              "documentation": "The logical resource id associated with the resource (must be supported by all servers)"
            },
            {
              "name": "related-item",
              "definition": "http://hl7.org/fhir/profiles/Condition",
              "type": "reference",
              "documentation": "Relationship target resource"
            },
            {
              "name": "_language",
              "definition": "http://hl7.org/fhir/profiles/Condition",
              "type": "token",
              "documentation": "The stated language of the resource"
            }
          ]
        },
        {
          "type": "Conformance",
          "profile": {
            "reference": "http://hl7.org/fhir/Conformance"
          },
          "operation": [
            {
              "code": "read"
            },
            {
              "code": "vread"
            },
            {
              "code": "update"
            },
            {
              "code": "delete"
            },
            {
              "code": "history-instance"
            },
            {
              "code": "validate"
            },
            {
              "code": "history-type"
            },
            {
              "code": "create"
            },
            {
              "code": "search-type"
            }
          ],
          "searchParam": [
            {
              "name": "status",
              "definition": "http://hl7.org/fhir/profiles/Conformance",
              "type": "token",
              "documentation": "The current status of the conformance statement"
            },
            {
              "name": "resource",
              "definition": "http://hl7.org/fhir/profiles/Conformance",
              "type": "token",
              "documentation": "Name of a resource mentioned in a conformance statement"
            },
            {
              "name": "security",
              "definition": "http://hl7.org/fhir/profiles/Conformance",
              "type": "token",
              "documentation": "Information about security of implementation"
            },
            {
              "name": "format",
              "definition": "http://hl7.org/fhir/profiles/Conformance",
              "type": "token",
              "documentation": "formats supported (xml | json | mime type)"
            },
            {
              "name": "date",
              "definition": "http://hl7.org/fhir/profiles/Conformance",
              "type": "date",
              "documentation": "The conformance statement publication date"
            },
            {
              "name": "mode",
              "definition": "http://hl7.org/fhir/profiles/Conformance",
              "type": "token",
              "documentation": "Mode - restful (server/client) or messaging (sender/receiver)"
            },
            {
              "name": "version",
              "definition": "http://hl7.org/fhir/profiles/Conformance",
              "type": "token",
              "documentation": "The version identifier of the conformance statement"
            },
            {
              "name": "publisher",
              "definition": "http://hl7.org/fhir/profiles/Conformance",
              "type": "string",
              "documentation": "Name of the publisher of the conformance statement"
            },
            {
              "name": "software",
              "definition": "http://hl7.org/fhir/profiles/Conformance",
              "type": "string",
              "documentation": "Part of a the name of a software application"
            },
            {
              "name": "_id",
              "definition": "http://hl7.org/fhir/profiles/Conformance",
              "type": "token",
              "documentation": "The logical resource id associated with the resource (must be supported by all servers)"
            },
            {
              "name": "event",
              "definition": "http://hl7.org/fhir/profiles/Conformance",
              "type": "token",
              "documentation": "Event code in a conformance statement"
            },
            {
              "name": "description",
              "definition": "http://hl7.org/fhir/profiles/Conformance",
              "type": "string",
              "documentation": "Text search in the description of the conformance statement"
            },
            {
              "name": "name",
              "definition": "http://hl7.org/fhir/profiles/Conformance",
              "type": "string",
              "documentation": "Name of the conformance statement"
            },
            {
              "name": "supported-profile",
              "definition": "http://hl7.org/fhir/profiles/Conformance",
              "type": "reference",
              "documentation": "Profiles supported by the system"
            },
            {
              "name": "fhirversion",
              "definition": "http://hl7.org/fhir/profiles/Conformance",
              "type": "token",
              "documentation": "The version of FHIR"
            },
            {
              "name": "_language",
              "definition": "http://hl7.org/fhir/profiles/Conformance",
              "type": "token",
              "documentation": "The stated language of the resource"
            },
            {
              "name": "identifier",
              "definition": "http://hl7.org/fhir/profiles/Conformance",
              "type": "token",
              "documentation": "The identifier of the conformance statement"
            },
            {
              "name": "profile",
              "definition": "http://hl7.org/fhir/profiles/Conformance",
              "type": "reference",
              "documentation": "A profile id invoked in a conformance statement"
            }
          ]
        },
        {
          "type": "Device",
          "profile": {
            "reference": "http://hl7.org/fhir/Device"
          },
          "operation": [
            {
              "code": "read"
            },
            {
              "code": "vread"
            },
            {
              "code": "update"
            },
            {
              "code": "delete"
            },
            {
              "code": "history-instance"
            },
            {
              "code": "validate"
            },
            {
              "code": "history-type"
            },
            {
              "code": "create"
            },
            {
              "code": "search-type"
            }
          ],
          "searchParam": [
            {
              "name": "organization",
              "definition": "http://hl7.org/fhir/profiles/Device",
              "type": "reference",
              "documentation": "The organization responsible for the device"
            },
            {
              "name": "model",
              "definition": "http://hl7.org/fhir/profiles/Device",
              "type": "string",
              "documentation": "The model of the device"
            },
            {
              "name": "patient",
              "definition": "http://hl7.org/fhir/profiles/Device",
              "type": "reference",
              "documentation": "Patient information, if the resource is affixed to a person"
            },
            {
              "name": "_id",
              "definition": "http://hl7.org/fhir/profiles/Device",
              "type": "token",
              "documentation": "The logical resource id associated with the resource (must be supported by all servers)"
            },
            {
              "name": "location",
              "definition": "http://hl7.org/fhir/profiles/Device",
              "type": "reference",
              "documentation": "A location, where the resource is found"
            },
            {
              "name": "manufacturer",
              "definition": "http://hl7.org/fhir/profiles/Device",
              "type": "string",
              "documentation": "The manufacturer of the device"
            },
            {
              "name": "_language",
              "definition": "http://hl7.org/fhir/profiles/Device",
              "type": "token",
              "documentation": "The stated language of the resource"
            },
            {
              "name": "udi",
              "definition": "http://hl7.org/fhir/profiles/Device",
              "type": "string",
              "documentation": "FDA Mandated Unique Device Identifier"
            },
            {
              "name": "type",
              "definition": "http://hl7.org/fhir/profiles/Device",
              "type": "token",
              "documentation": "The type of the device"
            },
            {
              "name": "identifier",
              "definition": "http://hl7.org/fhir/profiles/Device",
              "type": "token",
              "documentation": "Instance id from manufacturer, owner and others"
            }
          ]
        },
        {
          "type": "DeviceObservationReport",
          "profile": {
            "reference": "http://hl7.org/fhir/DeviceObservationReport"
          },
          "operation": [
            {
              "code": "read"
            },
            {
              "code": "vread"
            },
            {
              "code": "update"
            },
            {
              "code": "delete"
            },
            {
              "code": "history-instance"
            },
            {
              "code": "validate"
            },
            {
              "code": "history-type"
            },
            {
              "code": "create"
            },
            {
              "code": "search-type"
            }
          ],
          "searchParam": [
            {
              "name": "observation",
              "definition": "http://hl7.org/fhir/profiles/DeviceObservationReport",
              "type": "reference",
              "documentation": "The data for the metric"
            },
            {
              "name": "source",
              "definition": "http://hl7.org/fhir/profiles/DeviceObservationReport",
              "type": "reference",
              "documentation": "Identifies/describes where the data came from"
            },
            {
              "name": "_id",
              "definition": "http://hl7.org/fhir/profiles/DeviceObservationReport",
              "type": "token",
              "documentation": "The logical resource id associated with the resource (must be supported by all servers)"
            },
            {
              "name": "subject",
              "definition": "http://hl7.org/fhir/profiles/DeviceObservationReport",
              "type": "reference",
              "documentation": "Subject of the measurement"
            },
            {
              "name": "_language",
              "definition": "http://hl7.org/fhir/profiles/DeviceObservationReport",
              "type": "token",
              "documentation": "The stated language of the resource"
            },
            {
              "name": "code",
              "definition": "http://hl7.org/fhir/profiles/DeviceObservationReport",
              "type": "token",
              "documentation": "The compatment code"
            },
            {
              "name": "channel",
              "definition": "http://hl7.org/fhir/profiles/DeviceObservationReport",
              "type": "token",
              "documentation": "The channel code"
            }
          ]
        },
        {
          "type": "DiagnosticOrder",
          "profile": {
            "reference": "http://hl7.org/fhir/DiagnosticOrder"
          },
          "operation": [
            {
              "code": "read"
            },
            {
              "code": "vread"
            },
            {
              "code": "update"
            },
            {
              "code": "delete"
            },
            {
              "code": "history-instance"
            },
            {
              "code": "validate"
            },
            {
              "code": "history-type"
            },
            {
              "code": "create"
            },
            {
              "code": "search-type"
            }
          ],
          "searchParam": [
            {
              "name": "orderer",
              "definition": "http://hl7.org/fhir/profiles/DiagnosticOrder",
              "type": "reference",
              "documentation": "Who ordered the test"
            },
            {
              "name": "status",
              "definition": "http://hl7.org/fhir/profiles/DiagnosticOrder",
              "type": "token",
              "documentation": "requested | received | accepted | in progress | review | completed | suspended | rejected | failed"
            },
            {
              "name": "subject",
              "definition": "http://hl7.org/fhir/profiles/DiagnosticOrder",
              "type": "reference",
              "documentation": "Who and/or what test is about"
            },
            {
              "name": "item-status",
              "definition": "http://hl7.org/fhir/profiles/DiagnosticOrder",
              "type": "token",
              "documentation": "requested | received | accepted | in progress | review | completed | suspended | rejected | failed"
            },
            {
              "name": "event-status",
              "definition": "http://hl7.org/fhir/profiles/DiagnosticOrder",
              "type": "token",
              "documentation": "requested | received | accepted | in progress | review | completed | suspended | rejected | failed"
            },
            {
              "name": "actor",
              "definition": "http://hl7.org/fhir/profiles/DiagnosticOrder",
              "type": "reference",
              "documentation": "Who recorded or did this"
            },
            {
              "name": "code",
              "definition": "http://hl7.org/fhir/profiles/DiagnosticOrder",
              "type": "token",
              "documentation": "Code to indicate the item (test or panel) being ordered"
            },
            {
              "name": "encounter",
              "definition": "http://hl7.org/fhir/profiles/DiagnosticOrder",
              "type": "reference",
              "documentation": "The encounter that this diagnostic order is associated with"
            },
            {
              "name": "item-past-status",
              "definition": "http://hl7.org/fhir/profiles/DiagnosticOrder",
              "type": "token",
              "documentation": "requested | received | accepted | in progress | review | completed | suspended | rejected | failed"
            },
            {
              "name": "_id",
              "definition": "http://hl7.org/fhir/profiles/DiagnosticOrder",
              "type": "token",
              "documentation": "The logical resource id associated with the resource (must be supported by all servers)"
            },
            {
              "name": "bodysite",
              "definition": "http://hl7.org/fhir/profiles/DiagnosticOrder",
              "type": "token",
              "documentation": "Location of requested test (if applicable)"
            },
            {
              "name": "item-date",
              "definition": "http://hl7.org/fhir/profiles/DiagnosticOrder",
              "type": "date",
              "documentation": "The date at which the event happened"
            },
            {
              "name": "specimen",
              "definition": "http://hl7.org/fhir/profiles/DiagnosticOrder",
              "type": "reference",
              "documentation": "If the whole order relates to specific specimens"
            },
            {
              "name": "event-status-date",
              "definition": "http://hl7.org/fhir/profiles/DiagnosticOrder",
              "type": "composite",
              "documentation": "A combination of past-status and date"
            },
            {
              "name": "_language",
              "definition": "http://hl7.org/fhir/profiles/DiagnosticOrder",
              "type": "token",
              "documentation": "The stated language of the resource"
            },
            {
              "name": "event-date",
              "definition": "http://hl7.org/fhir/profiles/DiagnosticOrder",
              "type": "date",
              "documentation": "The date at which the event happened"
            },
            {
              "name": "identifier",
              "definition": "http://hl7.org/fhir/profiles/DiagnosticOrder",
              "type": "token",
              "documentation": "Identifiers assigned to this order"
            },
            {
              "name": "item-status-date",
              "definition": "http://hl7.org/fhir/profiles/DiagnosticOrder",
              "type": "composite",
              "documentation": "A combination of item-past-status and item-date"
            }
          ]
        },
        {
          "type": "DiagnosticReport",
          "profile": {
            "reference": "http://hl7.org/fhir/DiagnosticReport"
          },
          "operation": [
            {
              "code": "read"
            },
            {
              "code": "vread"
            },
            {
              "code": "update"
            },
            {
              "code": "delete"
            },
            {
              "code": "history-instance"
            },
            {
              "code": "validate"
            },
            {
              "code": "history-type"
            },
            {
              "code": "create"
            },
            {
              "code": "search-type"
            }
          ],
          "searchParam": [
            {
              "name": "result",
              "definition": "http://hl7.org/fhir/profiles/DiagnosticReport",
              "type": "reference",
              "documentation": "Link to an atomic result (observation resource)"
            },
            {
              "name": "status",
              "definition": "http://hl7.org/fhir/profiles/DiagnosticReport",
              "type": "token",
              "documentation": "The status of the report"
            },
            {
              "name": "subject",
              "definition": "http://hl7.org/fhir/profiles/DiagnosticReport",
              "type": "reference",
              "documentation": "The subject of the report"
            },
            {
              "name": "issued",
              "definition": "http://hl7.org/fhir/profiles/DiagnosticReport",
              "type": "date",
              "documentation": "When the report was issued"
            },
            {
              "name": "diagnosis",
              "definition": "http://hl7.org/fhir/profiles/DiagnosticReport",
              "type": "token",
              "documentation": "A coded diagnosis on the report"
            },
            {
              "name": "image",
              "definition": "http://hl7.org/fhir/profiles/DiagnosticReport",
              "type": "reference",
              "documentation": "Reference to the image source"
            },
            {
              "name": "date",
              "definition": "http://hl7.org/fhir/profiles/DiagnosticReport",
              "type": "date",
              "documentation": "The clinically relevant time of the report"
            },
            {
              "name": "_id",
              "definition": "http://hl7.org/fhir/profiles/DiagnosticReport",
              "type": "token",
              "documentation": "The logical resource id associated with the resource (must be supported by all servers)"
            },
            {
              "name": "request",
              "definition": "http://hl7.org/fhir/profiles/DiagnosticReport",
              "type": "reference",
              "documentation": "What was requested"
            },
            {
              "name": "specimen",
              "definition": "http://hl7.org/fhir/profiles/DiagnosticReport",
              "type": "reference",
              "documentation": "The specimen details"
            },
            {
              "name": "name",
              "definition": "http://hl7.org/fhir/profiles/DiagnosticReport",
              "type": "token",
              "documentation": "The name of the report (e.g. the code for the report as a whole, as opposed to codes for the atomic results, which are the names on the observation resource referred to from the result)"
            },
            {
              "name": "service",
              "definition": "http://hl7.org/fhir/profiles/DiagnosticReport",
              "type": "token",
              "documentation": "Which diagnostic discipline/department created the report"
            },
            {
              "name": "performer",
              "definition": "http://hl7.org/fhir/profiles/DiagnosticReport",
              "type": "reference",
              "documentation": "Who was the source of the report (organization)"
            },
            {
              "name": "_language",
              "definition": "http://hl7.org/fhir/profiles/DiagnosticReport",
              "type": "token",
              "documentation": "The stated language of the resource"
            },
            {
              "name": "identifier",
              "definition": "http://hl7.org/fhir/profiles/DiagnosticReport",
              "type": "token",
              "documentation": "An identifier for the report"
            }
          ]
        },
        {
          "type": "DocumentManifest",
          "profile": {
            "reference": "http://hl7.org/fhir/DocumentManifest"
          },
          "operation": [
            {
              "code": "read"
            },
            {
              "code": "vread"
            },
            {
              "code": "update"
            },
            {
              "code": "delete"
            },
            {
              "code": "history-instance"
            },
            {
              "code": "validate"
            },
            {
              "code": "history-type"
            },
            {
              "code": "create"
            },
            {
              "code": "search-type"
            }
          ],
          "searchParam": [
            {
              "name": "content",
              "definition": "http://hl7.org/fhir/profiles/DocumentManifest",
              "type": "reference",
              "documentation": "Contents of this set of documents"
            },
            {
              "name": "author",
              "definition": "http://hl7.org/fhir/profiles/DocumentManifest",
              "type": "reference",
              "documentation": "Who and/or what authored the document"
            },
            {
              "name": "supersedes",
              "definition": "http://hl7.org/fhir/profiles/DocumentManifest",
              "type": "reference",
              "documentation": "If this document manifest replaces another"
            },
            {
              "name": "_id",
              "definition": "http://hl7.org/fhir/profiles/DocumentManifest",
              "type": "token",
              "documentation": "The logical resource id associated with the resource (must be supported by all servers)"
            },
            {
              "name": "status",
              "definition": "http://hl7.org/fhir/profiles/DocumentManifest",
              "type": "token",
              "documentation": "current | superceded | entered in error"
            },
            {
              "name": "created",
              "definition": "http://hl7.org/fhir/profiles/DocumentManifest",
              "type": "date",
              "documentation": "When this document manifest created"
            },
            {
              "name": "confidentiality",
              "definition": "http://hl7.org/fhir/profiles/DocumentManifest",
              "type": "token",
              "documentation": "Sensitivity of set of documents"
            },
            {
              "name": "description",
              "definition": "http://hl7.org/fhir/profiles/DocumentManifest",
              "type": "string",
              "documentation": "Human-readable description (title)"
            },
            {
              "name": "subject",
              "definition": "http://hl7.org/fhir/profiles/DocumentManifest",
              "type": "reference",
              "documentation": "The subject of the set of documents"
            },
            {
              "name": "_language",
              "definition": "http://hl7.org/fhir/profiles/DocumentManifest",
              "type": "token",
              "documentation": "The stated language of the resource"
            },
            {
              "name": "type",
              "definition": "http://hl7.org/fhir/profiles/DocumentManifest",
              "type": "token",
              "documentation": "What kind of document set this is"
            },
            {
              "name": "identifier",
              "definition": "http://hl7.org/fhir/profiles/DocumentManifest",
              "type": "token",
              "documentation": "Unique Identifier for the set of documents"
            },
            {
              "name": "recipient",
              "definition": "http://hl7.org/fhir/profiles/DocumentManifest",
              "type": "reference",
              "documentation": "Intended to get notified about this set of documents"
            }
          ]
        },
        {
          "type": "DocumentReference",
          "profile": {
            "reference": "http://hl7.org/fhir/DocumentReference"
          },
          "operation": [
            {
              "code": "read"
            },
            {
              "code": "vread"
            },
            {
              "code": "update"
            },
            {
              "code": "delete"
            },
            {
              "code": "history-instance"
            },
            {
              "code": "validate"
            },
            {
              "code": "history-type"
            },
            {
              "code": "create"
            },
            {
              "code": "search-type"
            }
          ],
          "searchParam": [
            {
              "name": "location",
              "definition": "http://hl7.org/fhir/profiles/DocumentReference",
              "type": "string",
              "documentation": "Where to access the document"
            },
            {
              "name": "indexed",
              "definition": "http://hl7.org/fhir/profiles/DocumentReference",
              "type": "date",
              "documentation": "When this document reference created"
            },
            {
              "name": "status",
              "definition": "http://hl7.org/fhir/profiles/DocumentReference",
              "type": "token",
              "documentation": "current | superceded | entered in error"
            },
            {
              "name": "relatesto",
              "definition": "http://hl7.org/fhir/profiles/DocumentReference",
              "type": "reference",
              "documentation": "Target of the relationship"
            },
            {
              "name": "subject",
              "definition": "http://hl7.org/fhir/profiles/DocumentReference",
              "type": "reference",
              "documentation": "Who|what is the subject of the document"
            },
            {
              "name": "relation",
              "definition": "http://hl7.org/fhir/profiles/DocumentReference",
              "type": "token",
              "documentation": "replaces | transforms | signs | appends"
            },
            {
              "name": "class",
              "definition": "http://hl7.org/fhir/profiles/DocumentReference",
              "type": "token",
              "documentation": "Categorization of Document"
            },
            {
              "name": "format",
              "definition": "http://hl7.org/fhir/profiles/DocumentReference",
              "type": "token",
              "documentation": "Format/content rules for the document"
            },
            {
              "name": "period",
              "definition": "http://hl7.org/fhir/profiles/DocumentReference",
              "type": "date",
              "documentation": "Time of service that is being documented"
            },
            {
              "name": "type",
              "definition": "http://hl7.org/fhir/profiles/DocumentReference",
              "type": "token",
              "documentation": "What kind of document this is (LOINC if possible)"
            },
            {
              "name": "authenticator",
              "definition": "http://hl7.org/fhir/profiles/DocumentReference",
              "type": "reference",
              "documentation": "Who/What authenticated the document"
            },
            {
              "name": "size",
              "definition": "http://hl7.org/fhir/profiles/DocumentReference",
              "type": "number",
              "documentation": "Size of the document in bytes"
            },
            {
              "name": "relationship",
              "definition": "http://hl7.org/fhir/profiles/DocumentReference",
              "type": "composite",
              "documentation": "Combination of relation and relatesTo"
            },
            {
              "name": "author",
              "definition": "http://hl7.org/fhir/profiles/DocumentReference",
              "type": "reference",
              "documentation": "Who and/or what authored the document"
            },
            {
              "name": "custodian",
              "definition": "http://hl7.org/fhir/profiles/DocumentReference",
              "type": "reference",
              "documentation": "Org which maintains the document"
            },
            {
              "name": "facility",
              "definition": "http://hl7.org/fhir/profiles/DocumentReference",
              "type": "token",
              "documentation": "Kind of facility where patient was seen"
            },
            {
              "name": "_id",
              "definition": "http://hl7.org/fhir/profiles/DocumentReference",
              "type": "token",
              "documentation": "The logical resource id associated with the resource (must be supported by all servers)"
            },
            {
              "name": "created",
              "definition": "http://hl7.org/fhir/profiles/DocumentReference",
              "type": "date",
              "documentation": "Document creation time"
            },
            {
              "name": "event",
              "definition": "http://hl7.org/fhir/profiles/DocumentReference",
              "type": "token",
              "documentation": "Main Clinical Acts Documented"
            },
            {
              "name": "confidentiality",
              "definition": "http://hl7.org/fhir/profiles/DocumentReference",
              "type": "token",
              "documentation": "Sensitivity of source document"
            },
            {
              "name": "description",
              "definition": "http://hl7.org/fhir/profiles/DocumentReference",
              "type": "string",
              "documentation": "Human-readable description (title)"
            },
            {
              "name": "_language",
              "definition": "http://hl7.org/fhir/profiles/DocumentReference",
              "type": "token",
              "documentation": "The stated language of the resource"
            },
            {
              "name": "language",
              "definition": "http://hl7.org/fhir/profiles/DocumentReference",
              "type": "token",
              "documentation": "The marked primary language for the document"
            },
            {
              "name": "identifier",
              "definition": "http://hl7.org/fhir/profiles/DocumentReference",
              "type": "token",
              "documentation": "Master Version Specific Identifier"
            }
          ]
        },
        {
          "type": "Encounter",
          "profile": {
            "reference": "http://hl7.org/fhir/Encounter"
          },
          "operation": [
            {
              "code": "read"
            },
            {
              "code": "vread"
            },
            {
              "code": "update"
            },
            {
              "code": "delete"
            },
            {
              "code": "history-instance"
            },
            {
              "code": "validate"
            },
            {
              "code": "history-type"
            },
            {
              "code": "create"
            },
            {
              "code": "search-type"
            }
          ],
          "searchParam": [
            {
              "name": "_id",
              "definition": "http://hl7.org/fhir/profiles/Encounter",
              "type": "token",
              "documentation": "The logical resource id associated with the resource (must be supported by all servers)"
            },
            {
              "name": "location",
              "definition": "http://hl7.org/fhir/profiles/Encounter",
              "type": "reference",
              "documentation": "Location the encounter takes place"
            },
            {
              "name": "status",
              "definition": "http://hl7.org/fhir/profiles/Encounter",
              "type": "token",
              "documentation": "planned | in progress | onleave | finished | cancelled"
            },
            {
              "name": "subject",
              "definition": "http://hl7.org/fhir/profiles/Encounter",
              "type": "reference",
              "documentation": "The patient present at the encounter"
            },
            {
              "name": "indication",
              "definition": "http://hl7.org/fhir/profiles/Encounter",
              "type": "reference",
              "documentation": "Reason the encounter takes place (resource)"
            },
            {
              "name": "length",
              "definition": "http://hl7.org/fhir/profiles/Encounter",
              "type": "number",
              "documentation": "Length of encounter in days"
            },
            {
              "name": "_language",
              "definition": "http://hl7.org/fhir/profiles/Encounter",
              "type": "token",
              "documentation": "The stated language of the resource"
            },
            {
              "name": "date",
              "definition": "http://hl7.org/fhir/profiles/Encounter",
              "type": "date",
              "documentation": "A date within the period the Encounter lasted"
            },
            {
              "name": "identifier",
              "definition": "http://hl7.org/fhir/profiles/Encounter",
              "type": "token",
              "documentation": "Identifier(s) by which this encounter is known"
            },
            {
              "name": "location-period",
              "definition": "http://hl7.org/fhir/profiles/Encounter",
              "type": "date",
              "documentation": "Time period during which the patient was present at the location"
            }
          ]
        },
        {
          "type": "FamilyHistory",
          "profile": {
            "reference": "http://hl7.org/fhir/FamilyHistory"
          },
          "operation": [
            {
              "code": "read"
            },
            {
              "code": "vread"
            },
            {
              "code": "update"
            },
            {
              "code": "delete"
            },
            {
              "code": "history-instance"
            },
            {
              "code": "validate"
            },
            {
              "code": "history-type"
            },
            {
              "code": "create"
            },
            {
              "code": "search-type"
            }
          ],
          "searchParam": [
            {
              "name": "_id",
              "definition": "http://hl7.org/fhir/profiles/FamilyHistory",
              "type": "token",
              "documentation": "The logical resource id associated with the resource (must be supported by all servers)"
            },
            {
              "name": "subject",
              "definition": "http://hl7.org/fhir/profiles/FamilyHistory",
              "type": "reference",
              "documentation": "The identity of a subject to list family history items for"
            },
            {
              "name": "_language",
              "definition": "http://hl7.org/fhir/profiles/FamilyHistory",
              "type": "token",
              "documentation": "The stated language of the resource"
            }
          ]
        },
        {
          "type": "Group",
          "profile": {
            "reference": "http://hl7.org/fhir/Group"
          },
          "operation": [
            {
              "code": "read"
            },
            {
              "code": "vread"
            },
            {
              "code": "update"
            },
            {
              "code": "delete"
            },
            {
              "code": "history-instance"
            },
            {
              "code": "validate"
            },
            {
              "code": "history-type"
            },
            {
              "code": "create"
            },
            {
              "code": "search-type"
            }
          ],
          "searchParam": [
            {
              "name": "member",
              "definition": "http://hl7.org/fhir/profiles/Group",
              "type": "reference",
              "documentation": "Who is in group"
            },
            {
              "name": "_id",
              "definition": "http://hl7.org/fhir/profiles/Group",
              "type": "token",
              "documentation": "The logical resource id associated with the resource (must be supported by all servers)"
            },
            {
              "name": "characteristic-value",
              "definition": "http://hl7.org/fhir/profiles/Group",
              "type": "composite",
              "documentation": "A composite of both characteristic and value"
            },
            {
              "name": "value",
              "definition": "http://hl7.org/fhir/profiles/Group",
              "type": "token",
              "documentation": "Value held by characteristic"
            },
            {
              "name": "actual",
              "definition": "http://hl7.org/fhir/profiles/Group",
              "type": "token",
              "documentation": "Descriptive or actual"
            },
            {
              "name": "exclude",
              "definition": "http://hl7.org/fhir/profiles/Group",
              "type": "token",
              "documentation": "Group includes or excludes"
            },
            {
              "name": "_language",
              "definition": "http://hl7.org/fhir/profiles/Group",
              "type": "token",
              "documentation": "The stated language of the resource"
            },
            {
              "name": "code",
              "definition": "http://hl7.org/fhir/profiles/Group",
              "type": "token",
              "documentation": "The kind of resources contained"
            },
            {
              "name": "characteristic",
              "definition": "http://hl7.org/fhir/profiles/Group",
              "type": "token",
              "documentation": "Kind of characteristic"
            },
            {
              "name": "type",
              "definition": "http://hl7.org/fhir/profiles/Group",
              "type": "token",
              "documentation": "The type of resources the group contains"
            },
            {
              "name": "identifier",
              "definition": "http://hl7.org/fhir/profiles/Group",
              "type": "token",
              "documentation": "Unique id"
            }
          ]
        },
        {
          "type": "ImagingStudy",
          "profile": {
            "reference": "http://hl7.org/fhir/ImagingStudy"
          },
          "operation": [
            {
              "code": "read"
            },
            {
              "code": "vread"
            },
            {
              "code": "update"
            },
            {
              "code": "delete"
            },
            {
              "code": "history-instance"
            },
            {
              "code": "validate"
            },
            {
              "code": "history-type"
            },
            {
              "code": "create"
            },
            {
              "code": "search-type"
            }
          ],
          "searchParam": [
            {
              "name": "uid",
              "definition": "http://hl7.org/fhir/profiles/ImagingStudy",
              "type": "token",
              "documentation": "Formal identifier for this instance (0008,0018)"
            },
            {
              "name": "series",
              "definition": "http://hl7.org/fhir/profiles/ImagingStudy",
              "type": "token",
              "documentation": "The series id for the image"
            },
            {
              "name": "_id",
              "definition": "http://hl7.org/fhir/profiles/ImagingStudy",
              "type": "token",
              "documentation": "The logical resource id associated with the resource (must be supported by all servers)"
            },
            {
              "name": "bodysite",
              "definition": "http://hl7.org/fhir/profiles/ImagingStudy",
              "type": "token",
              "documentation": "Body part examined (Map from 0018,0015)"
            },
            {
              "name": "subject",
              "definition": "http://hl7.org/fhir/profiles/ImagingStudy",
              "type": "reference",
              "documentation": "Who the study is about"
            },
            {
              "name": "accession",
              "definition": "http://hl7.org/fhir/profiles/ImagingStudy",
              "type": "token",
              "documentation": "The accession id for the image"
            },
            {
              "name": "study",
              "definition": "http://hl7.org/fhir/profiles/ImagingStudy",
              "type": "token",
              "documentation": "The study id for the image"
            },
            {
              "name": "_language",
              "definition": "http://hl7.org/fhir/profiles/ImagingStudy",
              "type": "token",
              "documentation": "The stated language of the resource"
            },
            {
              "name": "modality",
              "definition": "http://hl7.org/fhir/profiles/ImagingStudy",
              "type": "token",
              "documentation": "The modality of the image"
            },
            {
              "name": "date",
              "definition": "http://hl7.org/fhir/profiles/ImagingStudy",
              "type": "date",
              "documentation": "The date the study was done was taken"
            },
            {
              "name": "dicom-class",
              "definition": "http://hl7.org/fhir/profiles/ImagingStudy",
              "type": "token",
              "documentation": "DICOM class type (0008,0016)"
            },
            {
              "name": "size",
              "definition": "http://hl7.org/fhir/profiles/ImagingStudy",
              "type": "number",
              "documentation": "The size of the image in MB - may include > or < in the value"
            }
          ]
        },
        {
          "type": "Immunization",
          "profile": {
            "reference": "http://hl7.org/fhir/Immunization"
          },
          "operation": [
            {
              "code": "read"
            },
            {
              "code": "vread"
            },
            {
              "code": "update"
            },
            {
              "code": "delete"
            },
            {
              "code": "history-instance"
            },
            {
              "code": "validate"
            },
            {
              "code": "history-type"
            },
            {
              "code": "create"
            },
            {
              "code": "search-type"
            }
          ],
          "searchParam": [
            {
              "name": "reaction",
              "definition": "http://hl7.org/fhir/profiles/Immunization",
              "type": "reference",
              "documentation": "Additional information on reaction"
            },
            {
              "name": "requester",
              "definition": "http://hl7.org/fhir/profiles/Immunization",
              "type": "reference",
              "documentation": "The practitioner who ordered the vaccination"
            },
            {
              "name": "dose-sequence",
              "definition": "http://hl7.org/fhir/profiles/Immunization",
              "type": "number",
              "documentation": "What dose number within series?"
            },
            {
              "name": "vaccine-type",
              "definition": "http://hl7.org/fhir/profiles/Immunization",
              "type": "token",
              "documentation": "Vaccine Product Type Administered"
            },
            {
              "name": "location",
              "definition": "http://hl7.org/fhir/profiles/Immunization",
              "type": "reference",
              "documentation": "The service delivery location or facility in which the vaccine was / was to be administered"
            },
            {
              "name": "reason",
              "definition": "http://hl7.org/fhir/profiles/Immunization",
              "type": "token",
              "documentation": "Why immunization occurred"
            },
            {
              "name": "subject",
              "definition": "http://hl7.org/fhir/profiles/Immunization",
              "type": "reference",
              "documentation": "The subject of the vaccination event / refusal"
            },
            {
              "name": "reaction-date",
              "definition": "http://hl7.org/fhir/profiles/Immunization",
              "type": "date",
              "documentation": "When did reaction start?"
            },
            {
              "name": "date",
              "definition": "http://hl7.org/fhir/profiles/Immunization",
              "type": "date",
              "documentation": "Vaccination  Administration / Refusal Date"
            },
            {
              "name": "lot-number",
              "definition": "http://hl7.org/fhir/profiles/Immunization",
              "type": "string",
              "documentation": "Vaccine Lot Number"
            },
            {
              "name": "_id",
              "definition": "http://hl7.org/fhir/profiles/Immunization",
              "type": "token",
              "documentation": "The logical resource id associated with the resource (must be supported by all servers)"
            },
            {
              "name": "manufacturer",
              "definition": "http://hl7.org/fhir/profiles/Immunization",
              "type": "reference",
              "documentation": "Vaccine Manufacturer"
            },
            {
              "name": "performer",
              "definition": "http://hl7.org/fhir/profiles/Immunization",
              "type": "reference",
              "documentation": "The practitioner who administered the vaccination"
            },
            {
              "name": "_language",
              "definition": "http://hl7.org/fhir/profiles/Immunization",
              "type": "token",
              "documentation": "The stated language of the resource"
            },
            {
              "name": "refused",
              "definition": "http://hl7.org/fhir/profiles/Immunization",
              "type": "token",
              "documentation": "Was immunization refused?"
            },
            {
              "name": "refusal-reason",
              "definition": "http://hl7.org/fhir/profiles/Immunization",
              "type": "token",
              "documentation": "Explanation of refusal / exemption"
            },
            {
              "name": "identifier",
              "definition": "http://hl7.org/fhir/profiles/Immunization",
              "type": "token",
              "documentation": "Business identifier"
            }
          ]
        },
        {
          "type": "ImmunizationRecommendation",
          "profile": {
            "reference": "http://hl7.org/fhir/ImmunizationRecommendation"
          },
          "operation": [
            {
              "code": "read"
            },
            {
              "code": "vread"
            },
            {
              "code": "update"
            },
            {
              "code": "delete"
            },
            {
              "code": "history-instance"
            },
            {
              "code": "validate"
            },
            {
              "code": "history-type"
            },
            {
              "code": "create"
            },
            {
              "code": "search-type"
            }
          ],
          "searchParam": [
            {
              "name": "information",
              "definition": "http://hl7.org/fhir/profiles/ImmunizationRecommendation",
              "type": "reference",
              "documentation": "Patient observations supporting recommendation"
            },
            {
              "name": "dose-sequence",
              "definition": "http://hl7.org/fhir/profiles/ImmunizationRecommendation",
              "type": "token",
              "documentation": "Number of dose within sequence"
            },
            {
              "name": "support",
              "definition": "http://hl7.org/fhir/profiles/ImmunizationRecommendation",
              "type": "reference",
              "documentation": "Past immunizations supporting recommendation"
            },
            {
              "name": "vaccine-type",
              "definition": "http://hl7.org/fhir/profiles/ImmunizationRecommendation",
              "type": "token",
              "documentation": "Vaccine recommendation applies to"
            },
            {
              "name": "_id",
              "definition": "http://hl7.org/fhir/profiles/ImmunizationRecommendation",
              "type": "token",
              "documentation": "The logical resource id associated with the resource (must be supported by all servers)"
            },
            {
              "name": "status",
              "definition": "http://hl7.org/fhir/profiles/ImmunizationRecommendation",
              "type": "token",
              "documentation": "Vaccine administration status"
            },
            {
              "name": "dose-number",
              "definition": "http://hl7.org/fhir/profiles/ImmunizationRecommendation",
              "type": "number",
              "documentation": "Recommended dose number"
            },
            {
              "name": "subject",
              "definition": "http://hl7.org/fhir/profiles/ImmunizationRecommendation",
              "type": "reference",
              "documentation": "Who this profile is for"
            },
            {
              "name": "_language",
              "definition": "http://hl7.org/fhir/profiles/ImmunizationRecommendation",
              "type": "token",
              "documentation": "The stated language of the resource"
            },
            {
              "name": "date",
              "definition": "http://hl7.org/fhir/profiles/ImmunizationRecommendation",
              "type": "date",
              "documentation": "Date recommendation created"
            },
            {
              "name": "identifier",
              "definition": "http://hl7.org/fhir/profiles/ImmunizationRecommendation",
              "type": "token",
              "documentation": "Business identifier"
            }
          ]
        },
        {
          "type": "List",
          "profile": {
            "reference": "http://hl7.org/fhir/List"
          },
          "operation": [
            {
              "code": "read"
            },
            {
              "code": "vread"
            },
            {
              "code": "update"
            },
            {
              "code": "delete"
            },
            {
              "code": "history-instance"
            },
            {
              "code": "validate"
            },
            {
              "code": "history-type"
            },
            {
              "code": "create"
            },
            {
              "code": "search-type"
            }
          ],
          "searchParam": [
            {
              "name": "source",
              "definition": "http://hl7.org/fhir/profiles/List",
              "type": "reference",
              "documentation": "Who and/or what defined the list contents"
            },
            {
              "name": "_id",
              "definition": "http://hl7.org/fhir/profiles/List",
              "type": "token",
              "documentation": "The logical resource id associated with the resource (must be supported by all servers)"
            },
            {
              "name": "subject",
              "definition": "http://hl7.org/fhir/profiles/List",
              "type": "reference",
              "documentation": "If all resources have the same subject"
            },
            {
              "name": "item",
              "definition": "http://hl7.org/fhir/profiles/List",
              "type": "reference",
              "documentation": "Actual entry"
            },
            {
              "name": "_language",
              "definition": "http://hl7.org/fhir/profiles/List",
              "type": "token",
              "documentation": "The stated language of the resource"
            },
            {
              "name": "code",
              "definition": "http://hl7.org/fhir/profiles/List",
              "type": "token",
              "documentation": "What the purpose of this list is"
            },
            {
              "name": "date",
              "definition": "http://hl7.org/fhir/profiles/List",
              "type": "date",
              "documentation": "When the list was prepared"
            },
            {
              "name": "empty-reason",
              "definition": "http://hl7.org/fhir/profiles/List",
              "type": "token",
              "documentation": "Why list is empty"
            }
          ]
        },
        {
          "type": "Location",
          "profile": {
            "reference": "http://hl7.org/fhir/Location"
          },
          "operation": [
            {
              "code": "read"
            },
            {
              "code": "vread"
            },
            {
              "code": "update"
            },
            {
              "code": "delete"
            },
            {
              "code": "history-instance"
            },
            {
              "code": "validate"
            },
            {
              "code": "history-type"
            },
            {
              "code": "create"
            },
            {
              "code": "search-type"
            }
          ],
          "searchParam": [
            {
              "name": "near",
              "definition": "http://hl7.org/fhir/profiles/Location",
              "type": "token",
              "documentation": "The coordinates expressed as [lat],[long] (using KML, see notes) to find locations near to (servers may search using a square rather than a circle for efficiency)"
            },
            {
              "name": "partof",
              "definition": "http://hl7.org/fhir/profiles/Location",
              "type": "reference",
              "documentation": "The location of which this location is a part"
            },
            {
              "name": "_id",
              "definition": "http://hl7.org/fhir/profiles/Location",
              "type": "token",
              "documentation": "The logical resource id associated with the resource (must be supported by all servers)"
            },
            {
              "name": "status",
              "definition": "http://hl7.org/fhir/profiles/Location",
              "type": "token",
              "documentation": "Searches for locations with a specific kind of status"
            },
            {
              "name": "address",
              "definition": "http://hl7.org/fhir/profiles/Location",
              "type": "string",
              "documentation": "A (part of the) address of the location"
            },
            {
              "name": "name",
              "definition": "http://hl7.org/fhir/profiles/Location",
              "type": "string",
              "documentation": "A (portion of the) name of the location"
            },
            {
              "name": "_language",
              "definition": "http://hl7.org/fhir/profiles/Location",
              "type": "token",
              "documentation": "The stated language of the resource"
            },
            {
              "name": "near-distance",
              "definition": "http://hl7.org/fhir/profiles/Location",
              "type": "token",
              "documentation": "A distance quantity to limit the near search to locations within a specific distance"
            },
            {
              "name": "type",
              "definition": "http://hl7.org/fhir/profiles/Location",
              "type": "token",
              "documentation": "A code for the type of location"
            },
            {
              "name": "identifier",
              "definition": "http://hl7.org/fhir/profiles/Location",
              "type": "token",
              "documentation": "Unique code or number identifying the location to its users"
            }
          ]
        },
        {
          "type": "Media",
          "profile": {
            "reference": "http://hl7.org/fhir/Media"
          },
          "operation": [
            {
              "code": "read"
            },
            {
              "code": "vread"
            },
            {
              "code": "update"
            },
            {
              "code": "delete"
            },
            {
              "code": "history-instance"
            },
            {
              "code": "validate"
            },
            {
              "code": "history-type"
            },
            {
              "code": "create"
            },
            {
              "code": "search-type"
            }
          ],
          "searchParam": [
            {
              "name": "_id",
              "definition": "http://hl7.org/fhir/profiles/Media",
              "type": "token",
              "documentation": "The logical resource id associated with the resource (must be supported by all servers)"
            },
            {
              "name": "subject",
              "definition": "http://hl7.org/fhir/profiles/Media",
              "type": "reference",
              "documentation": "Who/What this Media is a record of"
            },
            {
              "name": "subtype",
              "definition": "http://hl7.org/fhir/profiles/Media",
              "type": "token",
              "documentation": "The type of acquisition equipment/process"
            },
            {
              "name": "_language",
              "definition": "http://hl7.org/fhir/profiles/Media",
              "type": "token",
              "documentation": "The stated language of the resource"
            },
            {
              "name": "view",
              "definition": "http://hl7.org/fhir/profiles/Media",
              "type": "token",
              "documentation": "Imaging view e.g Lateral or Antero-posterior"
            },
            {
              "name": "date",
              "definition": "http://hl7.org/fhir/profiles/Media",
              "type": "date",
              "documentation": "When the media was taken/recorded (end)"
            },
            {
              "name": "type",
              "definition": "http://hl7.org/fhir/profiles/Media",
              "type": "token",
              "documentation": "photo | video | audio"
            },
            {
              "name": "identifier",
              "definition": "http://hl7.org/fhir/profiles/Media",
              "type": "token",
              "documentation": "Identifier(s) for the image"
            },
            {
              "name": "operator",
              "definition": "http://hl7.org/fhir/profiles/Media",
              "type": "reference",
              "documentation": "The person who generated the image"
            }
          ]
        },
        {
          "type": "Medication",
          "profile": {
            "reference": "http://hl7.org/fhir/Medication"
          },
          "operation": [
            {
              "code": "read"
            },
            {
              "code": "vread"
            },
            {
              "code": "update"
            },
            {
              "code": "delete"
            },
            {
              "code": "history-instance"
            },
            {
              "code": "validate"
            },
            {
              "code": "history-type"
            },
            {
              "code": "create"
            },
            {
              "code": "search-type"
            }
          ],
          "searchParam": [
            {
              "name": "content",
              "definition": "http://hl7.org/fhir/profiles/Medication",
              "type": "reference",
              "documentation": "A product in the package"
            },
            {
              "name": "form",
              "definition": "http://hl7.org/fhir/profiles/Medication",
              "type": "token",
              "documentation": "powder | tablets | carton +"
            },
            {
              "name": "_id",
              "definition": "http://hl7.org/fhir/profiles/Medication",
              "type": "token",
              "documentation": "The logical resource id associated with the resource (must be supported by all servers)"
            },
            {
              "name": "container",
              "definition": "http://hl7.org/fhir/profiles/Medication",
              "type": "token",
              "documentation": "E.g. box, vial, blister-pack"
            },
            {
              "name": "manufacturer",
              "definition": "http://hl7.org/fhir/profiles/Medication",
              "type": "reference",
              "documentation": "Manufacturer of the item"
            },
            {
              "name": "name",
              "definition": "http://hl7.org/fhir/profiles/Medication",
              "type": "string",
              "documentation": "Common / Commercial name"
            },
            {
              "name": "ingredient",
              "definition": "http://hl7.org/fhir/profiles/Medication",
              "type": "reference",
              "documentation": "The product contained"
            },
            {
              "name": "_language",
              "definition": "http://hl7.org/fhir/profiles/Medication",
              "type": "token",
              "documentation": "The stated language of the resource"
            },
            {
              "name": "code",
              "definition": "http://hl7.org/fhir/profiles/Medication",
              "type": "token",
              "documentation": "Codes that identify this medication"
            }
          ]
        },
        {
          "type": "MedicationAdministration",
          "profile": {
            "reference": "http://hl7.org/fhir/MedicationAdministration"
          },
          "operation": [
            {
              "code": "read"
            },
            {
              "code": "vread"
            },
            {
              "code": "update"
            },
            {
              "code": "delete"
            },
            {
              "code": "history-instance"
            },
            {
              "code": "validate"
            },
            {
              "code": "history-type"
            },
            {
              "code": "create"
            },
            {
              "code": "search-type"
            }
          ],
          "searchParam": [
            {
              "name": "medication",
              "definition": "http://hl7.org/fhir/profiles/MedicationAdministration",
              "type": "reference",
              "documentation": "Return administrations of this medication"
            },
            {
              "name": "patient",
              "definition": "http://hl7.org/fhir/profiles/MedicationAdministration",
              "type": "reference",
              "documentation": "The identity of a patient to list administrations  for"
            },
            {
              "name": "_id",
              "definition": "http://hl7.org/fhir/profiles/MedicationAdministration",
              "type": "token",
              "documentation": "The logical resource id associated with the resource (must be supported by all servers)"
            },
            {
              "name": "status",
              "definition": "http://hl7.org/fhir/profiles/MedicationAdministration",
              "type": "token",
              "documentation": "MedicationAdministration event status (for example one of active/paused/completed/nullified)"
            },
            {
              "name": "prescription",
              "definition": "http://hl7.org/fhir/profiles/MedicationAdministration",
              "type": "reference",
              "documentation": "The identity of a prescription to list administrations from"
            },
            {
              "name": "device",
              "definition": "http://hl7.org/fhir/profiles/MedicationAdministration",
              "type": "reference",
              "documentation": "Return administrations with this administration device identity"
            },
            {
              "name": "notgiven",
              "definition": "http://hl7.org/fhir/profiles/MedicationAdministration",
              "type": "token",
              "documentation": "Administrations that were not made"
            },
            {
              "name": "whengiven",
              "definition": "http://hl7.org/fhir/profiles/MedicationAdministration",
              "type": "date",
              "documentation": "Date of administration"
            },
            {
              "name": "_language",
              "definition": "http://hl7.org/fhir/profiles/MedicationAdministration",
              "type": "token",
              "documentation": "The stated language of the resource"
            },
            {
              "name": "encounter",
              "definition": "http://hl7.org/fhir/profiles/MedicationAdministration",
              "type": "reference",
              "documentation": "Return administrations that share this encounter"
            },
            {
              "name": "identifier",
              "definition": "http://hl7.org/fhir/profiles/MedicationAdministration",
              "type": "token",
              "documentation": "Return administrations with this external identity"
            }
          ]
        },
        {
          "type": "MedicationDispense",
          "profile": {
            "reference": "http://hl7.org/fhir/MedicationDispense"
          },
          "operation": [
            {
              "code": "read"
            },
            {
              "code": "vread"
            },
            {
              "code": "update"
            },
            {
              "code": "delete"
            },
            {
              "code": "history-instance"
            },
            {
              "code": "validate"
            },
            {
              "code": "history-type"
            },
            {
              "code": "create"
            },
            {
              "code": "search-type"
            }
          ],
          "searchParam": [
            {
              "name": "medication",
              "definition": "http://hl7.org/fhir/profiles/MedicationDispense",
              "type": "reference",
              "documentation": "Returns dispenses of this medicine"
            },
            {
              "name": "prescription",
              "definition": "http://hl7.org/fhir/profiles/MedicationDispense",
              "type": "reference",
              "documentation": "The identity of a prescription to list dispenses from"
            },
            {
              "name": "status",
              "definition": "http://hl7.org/fhir/profiles/MedicationDispense",
              "type": "token",
              "documentation": "Status of the dispense"
            },
            {
              "name": "type",
              "definition": "http://hl7.org/fhir/profiles/MedicationDispense",
              "type": "token",
              "documentation": "Return all dispenses of a specific type"
            },
            {
              "name": "destination",
              "definition": "http://hl7.org/fhir/profiles/MedicationDispense",
              "type": "reference",
              "documentation": "Return dispenses that should be sent to a secific destination"
            },
            {
              "name": "patient",
              "definition": "http://hl7.org/fhir/profiles/MedicationDispense",
              "type": "reference",
              "documentation": "The identity of a patient to list dispenses  for"
            },
            {
              "name": "_id",
              "definition": "http://hl7.org/fhir/profiles/MedicationDispense",
              "type": "token",
              "documentation": "The logical resource id associated with the resource (must be supported by all servers)"
            },
            {
              "name": "responsibleparty",
              "definition": "http://hl7.org/fhir/profiles/MedicationDispense",
              "type": "reference",
              "documentation": "Return all dispenses with the specified responsible party"
            },
            {
              "name": "dispenser",
              "definition": "http://hl7.org/fhir/profiles/MedicationDispense",
              "type": "reference",
              "documentation": "Return all dispenses performed by a specific indiividual"
            },
            {
              "name": "_language",
              "definition": "http://hl7.org/fhir/profiles/MedicationDispense",
              "type": "token",
              "documentation": "The stated language of the resource"
            },
            {
              "name": "identifier",
              "definition": "http://hl7.org/fhir/profiles/MedicationDispense",
              "type": "token",
              "documentation": "Return dispenses with this external identity"
            },
            {
              "name": "whenprepared",
              "definition": "http://hl7.org/fhir/profiles/MedicationDispense",
              "type": "date",
              "documentation": "Date when medication prepared"
            },
            {
              "name": "whenhandedover",
              "definition": "http://hl7.org/fhir/profiles/MedicationDispense",
              "type": "date",
              "documentation": "Date when medication handed over to patient (outpatient setting), or supplied to ward or clinic (inpatient setting)"
            }
          ]
        },
        {
          "type": "MedicationPrescription",
          "profile": {
            "reference": "http://hl7.org/fhir/MedicationPrescription"
          },
          "operation": [
            {
              "code": "read"
            },
            {
              "code": "vread"
            },
            {
              "code": "update"
            },
            {
              "code": "delete"
            },
            {
              "code": "history-instance"
            },
            {
              "code": "validate"
            },
            {
              "code": "history-type"
            },
            {
              "code": "create"
            },
            {
              "code": "search-type"
            }
          ],
          "searchParam": [
            {
              "name": "medication",
              "definition": "http://hl7.org/fhir/profiles/MedicationPrescription",
              "type": "reference",
              "documentation": "Code for medicine or text in medicine name"
            },
            {
              "name": "datewritten",
              "definition": "http://hl7.org/fhir/profiles/MedicationPrescription",
              "type": "date",
              "documentation": "Return prescriptions written on this date"
            },
            {
              "name": "patient",
              "definition": "http://hl7.org/fhir/profiles/MedicationPrescription",
              "type": "reference",
              "documentation": "The identity of a patient to list dispenses  for"
            },
            {
              "name": "_id",
              "definition": "http://hl7.org/fhir/profiles/MedicationPrescription",
              "type": "token",
              "documentation": "The logical resource id associated with the resource (must be supported by all servers)"
            },
            {
              "name": "status",
              "definition": "http://hl7.org/fhir/profiles/MedicationPrescription",
              "type": "token",
              "documentation": "Status of the prescription"
            },
            {
              "name": "_language",
              "definition": "http://hl7.org/fhir/profiles/MedicationPrescription",
              "type": "token",
              "documentation": "The stated language of the resource"
            },
            {
              "name": "encounter",
              "definition": "http://hl7.org/fhir/profiles/MedicationPrescription",
              "type": "reference",
              "documentation": "Return prescriptions with this encounter identity"
            },
            {
              "name": "identifier",
              "definition": "http://hl7.org/fhir/profiles/MedicationPrescription",
              "type": "token",
              "documentation": "Return prescriptions with this external identity"
            }
          ]
        },
        {
          "type": "MedicationStatement",
          "profile": {
            "reference": "http://hl7.org/fhir/MedicationStatement"
          },
          "operation": [
            {
              "code": "read"
            },
            {
              "code": "vread"
            },
            {
              "code": "update"
            },
            {
              "code": "delete"
            },
            {
              "code": "history-instance"
            },
            {
              "code": "validate"
            },
            {
              "code": "history-type"
            },
            {
              "code": "create"
            },
            {
              "code": "search-type"
            }
          ],
          "searchParam": [
            {
              "name": "medication",
              "definition": "http://hl7.org/fhir/profiles/MedicationStatement",
              "type": "reference",
              "documentation": "Code for medicine or text in medicine name"
            },
            {
              "name": "patient",
              "definition": "http://hl7.org/fhir/profiles/MedicationStatement",
              "type": "reference",
              "documentation": "The identity of a patient to list administrations  for"
            },
            {
              "name": "_id",
              "definition": "http://hl7.org/fhir/profiles/MedicationStatement",
              "type": "token",
              "documentation": "The logical resource id associated with the resource (must be supported by all servers)"
            },
            {
              "name": "device",
              "definition": "http://hl7.org/fhir/profiles/MedicationStatement",
              "type": "reference",
              "documentation": "Return administrations with this administration device identity"
            },
            {
              "name": "_language",
              "definition": "http://hl7.org/fhir/profiles/MedicationStatement",
              "type": "token",
              "documentation": "The stated language of the resource"
            },
            {
              "name": "when-given",
              "definition": "http://hl7.org/fhir/profiles/MedicationStatement",
              "type": "date",
              "documentation": "Date of administration"
            },
            {
              "name": "identifier",
              "definition": "http://hl7.org/fhir/profiles/MedicationStatement",
              "type": "token",
              "documentation": "Return administrations with this external identity"
            }
          ]
        },
        {
          "type": "MessageHeader",
          "profile": {
            "reference": "http://hl7.org/fhir/MessageHeader"
          },
          "operation": [
            {
              "code": "read"
            },
            {
              "code": "vread"
            },
            {
              "code": "update"
            },
            {
              "code": "delete"
            },
            {
              "code": "history-instance"
            },
            {
              "code": "validate"
            },
            {
              "code": "history-type"
            },
            {
              "code": "create"
            },
            {
              "code": "search-type"
            }
          ],
          "searchParam": [
            {
              "name": "_id",
              "definition": "http://hl7.org/fhir/profiles/MessageHeader",
              "type": "token",
              "documentation": "The logical resource id associated with the resource (must be supported by all servers)"
            },
            {
              "name": "_language",
              "definition": "http://hl7.org/fhir/profiles/MessageHeader",
              "type": "token",
              "documentation": "The stated language of the resource"
            }
          ]
        },
        {
          "type": "Namespace",
          "profile": {
            "reference": "http://hl7.org/fhir/Namespace"
          },
          "operation": [
            {
              "code": "read"
            },
            {
              "code": "vread"
            },
            {
              "code": "update"
            },
            {
              "code": "delete"
            },
            {
              "code": "history-instance"
            },
            {
              "code": "validate"
            },
            {
              "code": "history-type"
            },
            {
              "code": "create"
            },
            {
              "code": "search-type"
            }
          ],
          "searchParam": [
            {
              "name": "_id",
              "definition": "http://hl7.org/fhir/profiles/Namespace",
              "type": "token",
              "documentation": "The logical resource id associated with the resource (must be supported by all servers)"
            },
            {
              "name": "_language",
              "definition": "http://hl7.org/fhir/profiles/Namespace",
              "type": "token",
              "documentation": "The stated language of the resource"
            }
          ]
        },
        {
          "type": "Observation",
          "profile": {
            "reference": "http://hl7.org/fhir/Observation"
          },
          "operation": [
            {
              "code": "read"
            },
            {
              "code": "vread"
            },
            {
              "code": "update"
            },
            {
              "code": "delete"
            },
            {
              "code": "history-instance"
            },
            {
              "code": "validate"
            },
            {
              "code": "history-type"
            },
            {
              "code": "create"
            },
            {
              "code": "search-type"
            }
          ],
          "searchParam": [
            {
              "name": "value-string",
              "definition": "http://hl7.org/fhir/profiles/Observation",
              "type": "string",
              "documentation": "The value of the observation, if the value is a string, and also searches in CodeableConcept.text"
            },
            {
              "name": "status",
              "definition": "http://hl7.org/fhir/profiles/Observation",
              "type": "token",
              "documentation": "The status of the observation"
            },
            {
              "name": "subject",
              "definition": "http://hl7.org/fhir/profiles/Observation",
              "type": "reference",
              "documentation": "The subject that the observation is about"
            },
            {
              "name": "value-concept",
              "definition": "http://hl7.org/fhir/profiles/Observation",
              "type": "token",
              "documentation": "The value of the observation, if the value is a CodeableConcept"
            },
            {
              "name": "reliability",
              "definition": "http://hl7.org/fhir/profiles/Observation",
              "type": "token",
              "documentation": "The reliability of the observation"
            },
            {
              "name": "date",
              "definition": "http://hl7.org/fhir/profiles/Observation",
              "type": "date",
              "documentation": "Obtained date/time. If the obtained element is a period, a date that falls in the period"
            },
            {
              "name": "name-value-[x]",
              "definition": "http://hl7.org/fhir/profiles/Observation",
              "type": "composite",
              "documentation": "Both name and one of the value parameters"
            },
            {
              "name": "related-target",
              "definition": "http://hl7.org/fhir/profiles/Observation",
              "type": "reference",
              "documentation": "Observation that is related to this one"
            },
            {
              "name": "related",
              "definition": "http://hl7.org/fhir/profiles/Observation",
              "type": "composite",
              "documentation": "Related Observations - search on related-type and related-target together"
            },
            {
              "name": "_id",
              "definition": "http://hl7.org/fhir/profiles/Observation",
              "type": "token",
              "documentation": "The logical resource id associated with the resource (must be supported by all servers)"
            },
            {
              "name": "specimen",
              "definition": "http://hl7.org/fhir/profiles/Observation",
              "type": "reference",
              "documentation": "Specimen used for this observation"
            },
            {
              "name": "name",
              "definition": "http://hl7.org/fhir/profiles/Observation",
              "type": "token",
              "documentation": "The name of the observation type"
            },
            {
              "name": "related-type",
              "definition": "http://hl7.org/fhir/profiles/Observation",
              "type": "token",
              "documentation": "has-component | has-member | derived-from | sequel-to | replaces | qualified-by | interfered-by"
            },
            {
              "name": "performer",
              "definition": "http://hl7.org/fhir/profiles/Observation",
              "type": "reference",
              "documentation": "Who and/or what performed the observation"
            },
            {
              "name": "_language",
              "definition": "http://hl7.org/fhir/profiles/Observation",
              "type": "token",
              "documentation": "The stated language of the resource"
            },
            {
              "name": "value-quantity",
              "definition": "http://hl7.org/fhir/profiles/Observation",
              "type": "quantity",
              "documentation": "The value of the observation, if the value is a Quantity, or a SampledData (just search on the bounds of the values in sampled data)"
            },
            {
              "name": "value-date",
              "definition": "http://hl7.org/fhir/profiles/Observation",
              "type": "date",
              "documentation": "The value of the observation, if the value is a Period"
            }
          ]
        },
        {
          "type": "OperationOutcome",
          "profile": {
            "reference": "http://hl7.org/fhir/OperationOutcome"
          },
          "operation": [
            {
              "code": "read"
            },
            {
              "code": "vread"
            },
            {
              "code": "update"
            },
            {
              "code": "delete"
            },
            {
              "code": "history-instance"
            },
            {
              "code": "validate"
            },
            {
              "code": "history-type"
            },
            {
              "code": "create"
            },
            {
              "code": "search-type"
            }
          ],
          "searchParam": [
            {
              "name": "_id",
              "definition": "http://hl7.org/fhir/profiles/OperationOutcome",
              "type": "token",
              "documentation": "The logical resource id associated with the resource (must be supported by all servers)"
            },
            {
              "name": "_language",
              "definition": "http://hl7.org/fhir/profiles/OperationOutcome",
              "type": "token",
              "documentation": "The stated language of the resource"
            }
          ]
        },
        {
          "type": "Order",
          "profile": {
            "reference": "http://hl7.org/fhir/Order"
          },
          "operation": [
            {
              "code": "read"
            },
            {
              "code": "vread"
            },
            {
              "code": "update"
            },
            {
              "code": "delete"
            },
            {
              "code": "history-instance"
            },
            {
              "code": "validate"
            },
            {
              "code": "history-type"
            },
            {
              "code": "create"
            },
            {
              "code": "search-type"
            }
          ],
          "searchParam": [
            {
              "name": "authority",
              "definition": "http://hl7.org/fhir/profiles/Order",
              "type": "reference",
              "documentation": "If required by policy"
            },
            {
              "name": "detail",
              "definition": "http://hl7.org/fhir/profiles/Order",
              "type": "reference",
              "documentation": "What action is being ordered"
            },
            {
              "name": "source",
              "definition": "http://hl7.org/fhir/profiles/Order",
              "type": "reference",
              "documentation": "Who initiated the order"
            },
            {
              "name": "_id",
              "definition": "http://hl7.org/fhir/profiles/Order",
              "type": "token",
              "documentation": "The logical resource id associated with the resource (must be supported by all servers)"
            },
            {
              "name": "subject",
              "definition": "http://hl7.org/fhir/profiles/Order",
              "type": "reference",
              "documentation": "Patient this order is about"
            },
            {
              "name": "when",
              "definition": "http://hl7.org/fhir/profiles/Order",
              "type": "date",
              "documentation": "A formal schedule"
            },
            {
              "name": "target",
              "definition": "http://hl7.org/fhir/profiles/Order",
              "type": "reference",
              "documentation": "Who is intended to fulfill the order"
            },
            {
              "name": "_language",
              "definition": "http://hl7.org/fhir/profiles/Order",
              "type": "token",
              "documentation": "The stated language of the resource"
            },
            {
              "name": "when_code",
              "definition": "http://hl7.org/fhir/profiles/Order",
              "type": "token",
              "documentation": "Code specifies when request should be done. The code may simply be a priority code"
            },
            {
              "name": "date",
              "definition": "http://hl7.org/fhir/profiles/Order",
              "type": "date",
              "documentation": "When the order was made"
            }
          ]
        },
        {
          "type": "OrderResponse",
          "profile": {
            "reference": "http://hl7.org/fhir/OrderResponse"
          },
          "operation": [
            {
              "code": "read"
            },
            {
              "code": "vread"
            },
            {
              "code": "update"
            },
            {
              "code": "delete"
            },
            {
              "code": "history-instance"
            },
            {
              "code": "validate"
            },
            {
              "code": "history-type"
            },
            {
              "code": "create"
            },
            {
              "code": "search-type"
            }
          ],
          "searchParam": [
            {
              "name": "_id",
              "definition": "http://hl7.org/fhir/profiles/OrderResponse",
              "type": "token",
              "documentation": "The logical resource id associated with the resource (must be supported by all servers)"
            },
            {
              "name": "fulfillment",
              "definition": "http://hl7.org/fhir/profiles/OrderResponse",
              "type": "reference",
              "documentation": "Details of the outcome of performing the order"
            },
            {
              "name": "request",
              "definition": "http://hl7.org/fhir/profiles/OrderResponse",
              "type": "reference",
              "documentation": "The order that this is a response to"
            },
            {
              "name": "_language",
              "definition": "http://hl7.org/fhir/profiles/OrderResponse",
              "type": "token",
              "documentation": "The stated language of the resource"
            },
            {
              "name": "code",
              "definition": "http://hl7.org/fhir/profiles/OrderResponse",
              "type": "token",
              "documentation": "pending | review | rejected | error | accepted | cancelled | replaced | aborted | complete"
            },
            {
              "name": "date",
              "definition": "http://hl7.org/fhir/profiles/OrderResponse",
              "type": "date",
              "documentation": "When the response was made"
            },
            {
              "name": "who",
              "definition": "http://hl7.org/fhir/profiles/OrderResponse",
              "type": "reference",
              "documentation": "Who made the response"
            }
          ]
        },
        {
          "type": "Organization",
          "profile": {
            "reference": "http://hl7.org/fhir/Organization"
          },
          "operation": [
            {
              "code": "read"
            },
            {
              "code": "vread"
            },
            {
              "code": "update"
            },
            {
              "code": "delete"
            },
            {
              "code": "history-instance"
            },
            {
              "code": "validate"
            },
            {
              "code": "history-type"
            },
            {
              "code": "create"
            },
            {
              "code": "search-type"
            }
          ],
          "searchParam": [
            {
              "name": "phonetic",
              "definition": "http://hl7.org/fhir/profiles/Organization",
              "type": "string",
              "documentation": "A portion of the organization's name using some kind of phonetic matching algorithm"
            },
            {
              "name": "partof",
              "definition": "http://hl7.org/fhir/profiles/Organization",
              "type": "reference",
              "documentation": "Search all organizations that are part of the given organization"
            },
            {
              "name": "_id",
              "definition": "http://hl7.org/fhir/profiles/Organization",
              "type": "token",
              "documentation": "The logical resource id associated with the resource (must be supported by all servers)"
            },
            {
              "name": "name",
              "definition": "http://hl7.org/fhir/profiles/Organization",
              "type": "string",
              "documentation": "A portion of the organization's name"
            },
            {
              "name": "active",
              "definition": "http://hl7.org/fhir/profiles/Organization",
              "type": "token",
              "documentation": "Whether the organization's record is active"
            },
            {
              "name": "_language",
              "definition": "http://hl7.org/fhir/profiles/Organization",
              "type": "token",
              "documentation": "The stated language of the resource"
            },
            {
              "name": "type",
              "definition": "http://hl7.org/fhir/profiles/Organization",
              "type": "token",
              "documentation": "A code for the type of organization"
            },
            {
              "name": "identifier",
              "definition": "http://hl7.org/fhir/profiles/Organization",
              "type": "token",
              "documentation": "Any identifier for the organization (not the accreditation issuer's identifier)"
            }
          ]
        },
        {
          "type": "Other",
          "profile": {
            "reference": "http://hl7.org/fhir/Other"
          },
          "operation": [
            {
              "code": "read"
            },
            {
              "code": "vread"
            },
            {
              "code": "update"
            },
            {
              "code": "delete"
            },
            {
              "code": "history-instance"
            },
            {
              "code": "validate"
            },
            {
              "code": "history-type"
            },
            {
              "code": "create"
            },
            {
              "code": "search-type"
            }
          ],
          "searchParam": [
            {
              "name": "_id",
              "definition": "http://hl7.org/fhir/profiles/Other",
              "type": "token",
              "documentation": "The logical resource id associated with the resource (must be supported by all servers)"
            },
            {
              "name": "created",
              "definition": "http://hl7.org/fhir/profiles/Other",
              "type": "date",
              "documentation": "When created"
            },
            {
              "name": "subject",
              "definition": "http://hl7.org/fhir/profiles/Other",
              "type": "reference",
              "documentation": "Identifies the"
            },
            {
              "name": "_language",
              "definition": "http://hl7.org/fhir/profiles/Other",
              "type": "token",
              "documentation": "The stated language of the resource"
            },
            {
              "name": "code",
              "definition": "http://hl7.org/fhir/profiles/Other",
              "type": "token",
              "documentation": "Kind of Resource"
            }
          ]
        },
        {
          "type": "Patient",
          "profile": {
            "reference": "http://hl7.org/fhir/Patient"
          },
          "operation": [
            {
              "code": "read"
            },
            {
              "code": "vread"
            },
            {
              "code": "update"
            },
            {
              "code": "delete"
            },
            {
              "code": "history-instance"
            },
            {
              "code": "validate"
            },
            {
              "code": "history-type"
            },
            {
              "code": "create"
            },
            {
              "code": "search-type"
            }
          ],
          "searchParam": [
            {
              "name": "animal-breed",
              "definition": "http://hl7.org/fhir/profiles/Patient",
              "type": "token",
              "documentation": "The breed for animal patients"
            },
            {
              "name": "phonetic",
              "definition": "http://hl7.org/fhir/profiles/Patient",
              "type": "string",
              "documentation": "A portion of either family or given name using some kind of phonetic matching algorithm"
            },
            {
              "name": "link",
              "definition": "http://hl7.org/fhir/profiles/Patient",
              "type": "reference",
              "documentation": "All patients linked to the given patient"
            },
            {
              "name": "provider",
              "definition": "http://hl7.org/fhir/profiles/Patient",
              "type": "reference",
              "documentation": "The organization at which this person is a patient"
            },
            {
              "name": "animal-species",
              "definition": "http://hl7.org/fhir/profiles/Patient",
              "type": "token",
              "documentation": "The species for animal patients"
            },
            {
              "name": "_id",
              "definition": "http://hl7.org/fhir/profiles/Patient",
              "type": "token",
              "documentation": "The logical resource id associated with the resource (must be supported by all servers)"
            },
            {
              "name": "given",
              "definition": "http://hl7.org/fhir/profiles/Patient",
              "type": "string",
              "documentation": "A portion of the given name of the patient"
            },
            {
              "name": "address",
              "definition": "http://hl7.org/fhir/profiles/Patient",
              "type": "string",
              "documentation": "An address in any kind of address/part of the patient"
            },
            {
              "name": "family",
              "definition": "http://hl7.org/fhir/profiles/Patient",
              "type": "string",
              "documentation": "A portion of the family name of the patient"
            },
            {
              "name": "name",
              "definition": "http://hl7.org/fhir/profiles/Patient",
              "type": "string",
              "documentation": "A portion of either family or given name of the patient"
            },
            {
              "name": "telecom",
              "definition": "http://hl7.org/fhir/profiles/Patient",
              "type": "string",
              "documentation": "The value in any kind of telecom details of the patient"
            },
            {
              "name": "birthdate",
              "definition": "http://hl7.org/fhir/profiles/Patient",
              "type": "date",
              "documentation": "The patient's date of birth"
            },
            {
              "name": "active",
              "definition": "http://hl7.org/fhir/profiles/Patient",
              "type": "token",
              "documentation": "Whether the patient record is active"
            },
            {
              "name": "gender",
              "definition": "http://hl7.org/fhir/profiles/Patient",
              "type": "token",
              "documentation": "Gender of the patient"
            },
            {
              "name": "_language",
              "definition": "http://hl7.org/fhir/profiles/Patient",
              "type": "token",
              "documentation": "The stated language of the resource"
            },
            {
              "name": "language",
              "definition": "http://hl7.org/fhir/profiles/Patient",
              "type": "token",
              "documentation": "Language code (irrespective of use value)"
            },
            {
              "name": "identifier",
              "definition": "http://hl7.org/fhir/profiles/Patient",
              "type": "token",
              "documentation": "A patient identifier"
            }
          ]
        },
        {
          "type": "Practitioner",
          "profile": {
            "reference": "http://hl7.org/fhir/Practitioner"
          },
          "operation": [
            {
              "code": "read"
            },
            {
              "code": "vread"
            },
            {
              "code": "update"
            },
            {
              "code": "delete"
            },
            {
              "code": "history-instance"
            },
            {
              "code": "validate"
            },
            {
              "code": "history-type"
            },
            {
              "code": "create"
            },
            {
              "code": "search-type"
            }
          ],
          "searchParam": [
            {
              "name": "organization",
              "definition": "http://hl7.org/fhir/profiles/Practitioner",
              "type": "reference",
              "documentation": "The identity of the organization the practitioner represents / acts on behalf of"
            },
            {
              "name": "phonetic",
              "definition": "http://hl7.org/fhir/profiles/Practitioner",
              "type": "string",
              "documentation": "A portion of either family or given name using some kind of phonetic matching algorithm"
            },
            {
              "name": "given",
              "definition": "http://hl7.org/fhir/profiles/Practitioner",
              "type": "string",
              "documentation": "A portion of the given name"
            },
            {
              "name": "_id",
              "definition": "http://hl7.org/fhir/profiles/Practitioner",
              "type": "token",
              "documentation": "The logical resource id associated with the resource (must be supported by all servers)"
            },
            {
              "name": "address",
              "definition": "http://hl7.org/fhir/profiles/Practitioner",
              "type": "string",
              "documentation": "An address in any kind of address/part"
            },
            {
              "name": "family",
              "definition": "http://hl7.org/fhir/profiles/Practitioner",
              "type": "string",
              "documentation": "A portion of the family name"
            },
            {
              "name": "name",
              "definition": "http://hl7.org/fhir/profiles/Practitioner",
              "type": "string",
              "documentation": "A portion of either family or given name"
            },
            {
              "name": "telecom",
              "definition": "http://hl7.org/fhir/profiles/Practitioner",
              "type": "string",
              "documentation": "The value in any kind of contact"
            },
            {
              "name": "gender",
              "definition": "http://hl7.org/fhir/profiles/Practitioner",
              "type": "token",
              "documentation": "Gender of the practitioner"
            },
            {
              "name": "_language",
              "definition": "http://hl7.org/fhir/profiles/Practitioner",
              "type": "token",
              "documentation": "The stated language of the resource"
            },
            {
              "name": "identifier",
              "definition": "http://hl7.org/fhir/profiles/Practitioner",
              "type": "token",
              "documentation": "A practitioner's Identifier"
            }
          ]
        },
        {
          "type": "Procedure",
          "profile": {
            "reference": "http://hl7.org/fhir/Procedure"
          },
          "operation": [
            {
              "code": "read"
            },
            {
              "code": "vread"
            },
            {
              "code": "update"
            },
            {
              "code": "delete"
            },
            {
              "code": "history-instance"
            },
            {
              "code": "validate"
            },
            {
              "code": "history-type"
            },
            {
              "code": "create"
            },
            {
              "code": "search-type"
            }
          ],
          "searchParam": [
            {
              "name": "_id",
              "definition": "http://hl7.org/fhir/profiles/Procedure",
              "type": "token",
              "documentation": "The logical resource id associated with the resource (must be supported by all servers)"
            },
            {
              "name": "subject",
              "definition": "http://hl7.org/fhir/profiles/Procedure",
              "type": "reference",
              "documentation": "The identity of a patient to list procedures  for"
            },
            {
              "name": "_language",
              "definition": "http://hl7.org/fhir/profiles/Procedure",
              "type": "token",
              "documentation": "The stated language of the resource"
            },
            {
              "name": "date",
              "definition": "http://hl7.org/fhir/profiles/Procedure",
              "type": "date",
              "documentation": "The date the procedure was performed on"
            },
            {
              "name": "type",
              "definition": "http://hl7.org/fhir/profiles/Procedure",
              "type": "token",
              "documentation": "Type of procedure"
            }
          ]
        },
        {
          "type": "Profile",
          "profile": {
            "reference": "http://hl7.org/fhir/Profile"
          },
          "operation": [
            {
              "code": "read"
            },
            {
              "code": "vread"
            },
            {
              "code": "update"
            },
            {
              "code": "delete"
            },
            {
              "code": "history-instance"
            },
            {
              "code": "validate"
            },
            {
              "code": "history-type"
            },
            {
              "code": "create"
            },
            {
              "code": "search-type"
            }
          ],
          "searchParam": [
            {
              "name": "status",
              "definition": "http://hl7.org/fhir/profiles/Profile",
              "type": "token",
              "documentation": "The current status of the profile"
            },
            {
              "name": "code",
              "definition": "http://hl7.org/fhir/profiles/Profile",
              "type": "token",
              "documentation": "A code for the profile in the format uri::code (server may choose to do subsumption)"
            },
            {
              "name": "type",
              "definition": "http://hl7.org/fhir/profiles/Profile",
              "type": "token",
              "documentation": "Type of resource that is constrained in the profile"
            },
            {
              "name": "date",
              "definition": "http://hl7.org/fhir/profiles/Profile",
              "type": "date",
              "documentation": "The profile publication date"
            },
            {
              "name": "version",
              "definition": "http://hl7.org/fhir/profiles/Profile",
              "type": "token",
              "documentation": "The version identifier of the profile"
            },
            {
              "name": "publisher",
              "definition": "http://hl7.org/fhir/profiles/Profile",
              "type": "string",
              "documentation": "Name of the publisher of the profile"
            },
            {
              "name": "extension",
              "definition": "http://hl7.org/fhir/profiles/Profile",
              "type": "token",
              "documentation": "An extension code (use or definition)"
            },
            {
              "name": "_id",
              "definition": "http://hl7.org/fhir/profiles/Profile",
              "type": "token",
              "documentation": "The logical resource id associated with the resource (must be supported by all servers)"
            },
            {
              "name": "valueset",
              "definition": "http://hl7.org/fhir/profiles/Profile",
              "type": "reference",
              "documentation": "A vocabulary binding code"
            },
            {
              "name": "description",
              "definition": "http://hl7.org/fhir/profiles/Profile",
              "type": "string",
              "documentation": "Text search in the description of the profile"
            },
            {
              "name": "name",
              "definition": "http://hl7.org/fhir/profiles/Profile",
              "type": "string",
              "documentation": "Name of the profile"
            },
            {
              "name": "_language",
              "definition": "http://hl7.org/fhir/profiles/Profile",
              "type": "token",
              "documentation": "The stated language of the resource"
            },
            {
              "name": "identifier",
              "definition": "http://hl7.org/fhir/profiles/Profile",
              "type": "token",
              "documentation": "The identifier of the profile"
            }
          ]
        },
        {
          "type": "Provenance",
          "profile": {
            "reference": "http://hl7.org/fhir/Provenance"
          },
          "operation": [
            {
              "code": "read"
            },
            {
              "code": "vread"
            },
            {
              "code": "update"
            },
            {
              "code": "delete"
            },
            {
              "code": "history-instance"
            },
            {
              "code": "validate"
            },
            {
              "code": "history-type"
            },
            {
              "code": "create"
            },
            {
              "code": "search-type"
            }
          ],
          "searchParam": [
            {
              "name": "_id",
              "definition": "http://hl7.org/fhir/profiles/Provenance",
              "type": "token",
              "documentation": "The logical resource id associated with the resource (must be supported by all servers)"
            },
            {
              "name": "location",
              "definition": "http://hl7.org/fhir/profiles/Provenance",
              "type": "reference",
              "documentation": "Where the activity occurred, if relevant"
            },
            {
              "name": "start",
              "definition": "http://hl7.org/fhir/profiles/Provenance",
              "type": "date",
              "documentation": "Starting time with inclusive boundary"
            },
            {
              "name": "partytype",
              "definition": "http://hl7.org/fhir/profiles/Provenance",
              "type": "token",
              "documentation": "e.g. Resource | Person | Application | Record | Document +"
            },
            {
              "name": "target",
              "definition": "http://hl7.org/fhir/profiles/Provenance",
              "type": "reference",
              "documentation": "Target resource(s) (usually version specific)"
            },
            {
              "name": "_language",
              "definition": "http://hl7.org/fhir/profiles/Provenance",
              "type": "token",
              "documentation": "The stated language of the resource"
            },
            {
              "name": "party",
              "definition": "http://hl7.org/fhir/profiles/Provenance",
              "type": "token",
              "documentation": "Identity of agent (urn or url)"
            },
            {
              "name": "end",
              "definition": "http://hl7.org/fhir/profiles/Provenance",
              "type": "date",
              "documentation": "End time with inclusive boundary, if not ongoing"
            }
          ]
        },
        {
          "type": "Query",
          "profile": {
            "reference": "http://hl7.org/fhir/Query"
          },
          "operation": [
            {
              "code": "read"
            },
            {
              "code": "vread"
            },
            {
              "code": "update"
            },
            {
              "code": "delete"
            },
            {
              "code": "history-instance"
            },
            {
              "code": "validate"
            },
            {
              "code": "history-type"
            },
            {
              "code": "create"
            },
            {
              "code": "search-type"
            }
          ],
          "searchParam": [
            {
              "name": "response",
              "definition": "http://hl7.org/fhir/profiles/Query",
              "type": "token",
              "documentation": "Links response to source query"
            },
            {
              "name": "_id",
              "definition": "http://hl7.org/fhir/profiles/Query",
              "type": "token",
              "documentation": "The logical resource id associated with the resource (must be supported by all servers)"
            },
            {
              "name": "_language",
              "definition": "http://hl7.org/fhir/profiles/Query",
              "type": "token",
              "documentation": "The stated language of the resource"
            },
            {
              "name": "identifier",
              "definition": "http://hl7.org/fhir/profiles/Query",
              "type": "token",
              "documentation": "Links query and its response(s)"
            }
          ]
        },
        {
          "type": "Questionnaire",
          "profile": {
            "reference": "http://hl7.org/fhir/Questionnaire"
          },
          "operation": [
            {
              "code": "read"
            },
            {
              "code": "vread"
            },
            {
              "code": "update"
            },
            {
              "code": "delete"
            },
            {
              "code": "history-instance"
            },
            {
              "code": "validate"
            },
            {
              "code": "history-type"
            },
            {
              "code": "create"
            },
            {
              "code": "search-type"
            }
          ],
          "searchParam": [
            {
              "name": "author",
              "definition": "http://hl7.org/fhir/profiles/Questionnaire",
              "type": "reference",
              "documentation": "The author of the questionnaire"
            },
            {
              "name": "authored",
              "definition": "http://hl7.org/fhir/profiles/Questionnaire",
              "type": "date",
              "documentation": "When the questionnaire was authored"
            },
            {
              "name": "_id",
              "definition": "http://hl7.org/fhir/profiles/Questionnaire",
              "type": "token",
              "documentation": "The logical resource id associated with the resource (must be supported by all servers)"
            },
            {
              "name": "status",
              "definition": "http://hl7.org/fhir/profiles/Questionnaire",
              "type": "token",
              "documentation": "The status of the questionnaire"
            },
            {
              "name": "subject",
              "definition": "http://hl7.org/fhir/profiles/Questionnaire",
              "type": "reference",
              "documentation": "The subject of the questionnaire"
            },
            {
              "name": "name",
              "definition": "http://hl7.org/fhir/profiles/Questionnaire",
              "type": "token",
              "documentation": "Name of the questionnaire"
            },
            {
              "name": "_language",
              "definition": "http://hl7.org/fhir/profiles/Questionnaire",
              "type": "token",
              "documentation": "The stated language of the resource"
            },
            {
              "name": "encounter",
              "definition": "http://hl7.org/fhir/profiles/Questionnaire",
              "type": "reference",
              "documentation": "Encounter during which questionnaire was authored"
            },
            {
              "name": "identifier",
              "definition": "http://hl7.org/fhir/profiles/Questionnaire",
              "type": "token",
              "documentation": "An identifier for the questionnaire"
            }
          ]
        },
        {
          "type": "RelatedPerson",
          "profile": {
            "reference": "http://hl7.org/fhir/RelatedPerson"
          },
          "operation": [
            {
              "code": "read"
            },
            {
              "code": "vread"
            },
            {
              "code": "update"
            },
            {
              "code": "delete"
            },
            {
              "code": "history-instance"
            },
            {
              "code": "validate"
            },
            {
              "code": "history-type"
            },
            {
              "code": "create"
            },
            {
              "code": "search-type"
            }
          ],
          "searchParam": [
            {
              "name": "patient",
              "definition": "http://hl7.org/fhir/profiles/RelatedPerson",
              "type": "reference",
              "documentation": "The patient this person is related to"
            },
            {
              "name": "phonetic",
              "definition": "http://hl7.org/fhir/profiles/RelatedPerson",
              "type": "string",
              "documentation": "A portion of name using some kind of phonetic matching algorithm"
            },
            {
              "name": "_id",
              "definition": "http://hl7.org/fhir/profiles/RelatedPerson",
              "type": "token",
              "documentation": "The logical resource id associated with the resource (must be supported by all servers)"
            },
            {
              "name": "address",
              "definition": "http://hl7.org/fhir/profiles/RelatedPerson",
              "type": "string",
              "documentation": "An address in any kind of address/part"
            },
            {
              "name": "name",
              "definition": "http://hl7.org/fhir/profiles/RelatedPerson",
              "type": "string",
              "documentation": "A portion of name in any name part"
            },
            {
              "name": "telecom",
              "definition": "http://hl7.org/fhir/profiles/RelatedPerson",
              "type": "string",
              "documentation": "The value in any kind of contact"
            },
            {
              "name": "gender",
              "definition": "http://hl7.org/fhir/profiles/RelatedPerson",
              "type": "token",
              "documentation": "Gender of the person"
            },
            {
              "name": "_language",
              "definition": "http://hl7.org/fhir/profiles/RelatedPerson",
              "type": "token",
              "documentation": "The stated language of the resource"
            },
            {
              "name": "identifier",
              "definition": "http://hl7.org/fhir/profiles/RelatedPerson",
              "type": "token",
              "documentation": "A patient Identifier"
            }
          ]
        },
        {
          "type": "SecurityEvent",
          "profile": {
            "reference": "http://hl7.org/fhir/SecurityEvent"
          },
          "operation": [
            {
              "code": "read"
            },
            {
              "code": "vread"
            },
            {
              "code": "update"
            },
            {
              "code": "delete"
            },
            {
              "code": "history-instance"
            },
            {
              "code": "validate"
            },
            {
              "code": "history-type"
            },
            {
              "code": "create"
            },
            {
              "code": "search-type"
            }
          ],
          "searchParam": [
            {
              "name": "site",
              "definition": "http://hl7.org/fhir/profiles/SecurityEvent",
              "type": "token",
              "documentation": "Logical source location within the enterprise"
            },
            {
              "name": "desc",
              "definition": "http://hl7.org/fhir/profiles/SecurityEvent",
              "type": "string",
              "documentation": "Instance-specific descriptor for Object"
            },
            {
              "name": "type",
              "definition": "http://hl7.org/fhir/profiles/SecurityEvent",
              "type": "token",
              "documentation": "Type/identifier of event"
            },
            {
              "name": "date",
              "definition": "http://hl7.org/fhir/profiles/SecurityEvent",
              "type": "date",
              "documentation": "Time when the event occurred on source"
            },
            {
              "name": "reference",
              "definition": "http://hl7.org/fhir/profiles/SecurityEvent",
              "type": "reference",
              "documentation": "Specific instance of resource (e.g. versioned)"
            },
            {
              "name": "identity",
              "definition": "http://hl7.org/fhir/profiles/SecurityEvent",
              "type": "token",
              "documentation": "Specific instance of object (e.g. versioned)"
            },
            {
              "name": "altid",
              "definition": "http://hl7.org/fhir/profiles/SecurityEvent",
              "type": "token",
              "documentation": "Alternative User id e.g. authentication"
            },
            {
              "name": "patientid",
              "definition": "http://hl7.org/fhir/profiles/SecurityEvent",
              "type": "token",
              "documentation": "The id of the patient (one of multiple kinds of participations)"
            },
            {
              "name": "_id",
              "definition": "http://hl7.org/fhir/profiles/SecurityEvent",
              "type": "token",
              "documentation": "The logical resource id associated with the resource (must be supported by all servers)"
            },
            {
              "name": "source",
              "definition": "http://hl7.org/fhir/profiles/SecurityEvent",
              "type": "token",
              "documentation": "The id of source where event originated"
            },
            {
              "name": "address",
              "definition": "http://hl7.org/fhir/profiles/SecurityEvent",
              "type": "token",
              "documentation": "Identifier for the network access point of the user device"
            },
            {
              "name": "subtype",
              "definition": "http://hl7.org/fhir/profiles/SecurityEvent",
              "type": "token",
              "documentation": "More specific type/id for the event"
            },
            {
              "name": "name",
              "definition": "http://hl7.org/fhir/profiles/SecurityEvent",
              "type": "string",
              "documentation": "Human-meaningful name for the user"
            },
            {
              "name": "action",
              "definition": "http://hl7.org/fhir/profiles/SecurityEvent",
              "type": "token",
              "documentation": "Type of action performed during the event"
            },
            {
              "name": "_language",
              "definition": "http://hl7.org/fhir/profiles/SecurityEvent",
              "type": "token",
              "documentation": "The stated language of the resource"
            },
            {
              "name": "object-type",
              "definition": "http://hl7.org/fhir/profiles/SecurityEvent",
              "type": "token",
              "documentation": "Object type being audited"
            },
            {
              "name": "user",
              "definition": "http://hl7.org/fhir/profiles/SecurityEvent",
              "type": "token",
              "documentation": "Unique identifier for the user"
            }
          ]
        },
        {
          "type": "Slot",
          "profile": {
            "reference": "http://hl7.org/fhir/Slot"
          },
          "operation": [
            {
              "code": "read"
            },
            {
              "code": "vread"
            },
            {
              "code": "update"
            },
            {
              "code": "delete"
            },
            {
              "code": "history-instance"
            },
            {
              "code": "validate"
            },
            {
              "code": "history-type"
            },
            {
              "code": "create"
            },
            {
              "code": "search-type"
            }
          ],
          "searchParam": [
            {
              "name": "_id",
              "definition": "http://hl7.org/fhir/profiles/Slot",
              "type": "token",
              "documentation": "The logical resource id associated with the resource (must be supported by all servers)"
            },
            {
              "name": "start",
              "definition": "http://hl7.org/fhir/profiles/Slot",
              "type": "date",
              "documentation": "Appointment date/time."
            },
            {
              "name": "slottype",
              "definition": "http://hl7.org/fhir/profiles/Slot",
              "type": "token",
              "documentation": "The type of appointments that can be booked into the slot"
            },
            {
              "name": "_language",
              "definition": "http://hl7.org/fhir/profiles/Slot",
              "type": "token",
              "documentation": "The stated language of the resource"
            },
            {
              "name": "fbtype",
              "definition": "http://hl7.org/fhir/profiles/Slot",
              "type": "token",
              "documentation": "The free/busy status of the appointment"
            },
            {
              "name": "availability",
              "definition": "http://hl7.org/fhir/profiles/Slot",
              "type": "reference",
              "documentation": "The Availability Resource that we are seeking a slot within"
            }
          ]
        },
        {
          "type": "Specimen",
          "profile": {
            "reference": "http://hl7.org/fhir/Specimen"
          },
          "operation": [
            {
              "code": "read"
            },
            {
              "code": "vread"
            },
            {
              "code": "update"
            },
            {
              "code": "delete"
            },
            {
              "code": "history-instance"
            },
            {
              "code": "validate"
            },
            {
              "code": "history-type"
            },
            {
              "code": "create"
            },
            {
              "code": "search-type"
            }
          ],
          "searchParam": [
            {
              "name": "_id",
              "definition": "http://hl7.org/fhir/profiles/Specimen",
              "type": "token",
              "documentation": "The logical resource id associated with the resource (must be supported by all servers)"
            },
            {
              "name": "subject",
              "definition": "http://hl7.org/fhir/profiles/Specimen",
              "type": "reference",
              "documentation": "The subject of the specimen"
            },
            {
              "name": "_language",
              "definition": "http://hl7.org/fhir/profiles/Specimen",
              "type": "token",
              "documentation": "The stated language of the resource"
            }
          ]
        },
        {
          "type": "Substance",
          "profile": {
            "reference": "http://hl7.org/fhir/Substance"
          },
          "operation": [
            {
              "code": "read"
            },
            {
              "code": "vread"
            },
            {
              "code": "update"
            },
            {
              "code": "delete"
            },
            {
              "code": "history-instance"
            },
            {
              "code": "validate"
            },
            {
              "code": "history-type"
            },
            {
              "code": "create"
            },
            {
              "code": "search-type"
            }
          ],
          "searchParam": [
            {
              "name": "substance",
              "definition": "http://hl7.org/fhir/profiles/Substance",
              "type": "reference",
              "documentation": "A component of the substance"
            },
            {
              "name": "_id",
              "definition": "http://hl7.org/fhir/profiles/Substance",
              "type": "token",
              "documentation": "The logical resource id associated with the resource (must be supported by all servers)"
            },
            {
              "name": "quantity",
              "definition": "http://hl7.org/fhir/profiles/Substance",
              "type": "number",
              "documentation": "Amount of substance in the package"
            },
            {
              "name": "_language",
              "definition": "http://hl7.org/fhir/profiles/Substance",
              "type": "token",
              "documentation": "The stated language of the resource"
            },
            {
              "name": "type",
              "definition": "http://hl7.org/fhir/profiles/Substance",
              "type": "token",
              "documentation": "The type of the substance"
            },
            {
              "name": "identifier",
              "definition": "http://hl7.org/fhir/profiles/Substance",
              "type": "token",
              "documentation": "Identifier of the package/container"
            },
            {
              "name": "expiry",
              "definition": "http://hl7.org/fhir/profiles/Substance",
              "type": "date",
              "documentation": "When no longer valid to use"
            }
          ]
        },
        {
          "type": "Supply",
          "profile": {
            "reference": "http://hl7.org/fhir/Supply"
          },
          "operation": [
            {
              "code": "read"
            },
            {
              "code": "vread"
            },
            {
              "code": "update"
            },
            {
              "code": "delete"
            },
            {
              "code": "history-instance"
            },
            {
              "code": "validate"
            },
            {
              "code": "history-type"
            },
            {
              "code": "create"
            },
            {
              "code": "search-type"
            }
          ],
          "searchParam": [
            {
              "name": "patient",
              "definition": "http://hl7.org/fhir/profiles/Supply",
              "type": "reference",
              "documentation": "Patient for whom the item is supplied"
            },
            {
              "name": "_id",
              "definition": "http://hl7.org/fhir/profiles/Supply",
              "type": "token",
              "documentation": "The logical resource id associated with the resource (must be supported by all servers)"
            },
            {
              "name": "status",
              "definition": "http://hl7.org/fhir/profiles/Supply",
              "type": "token",
              "documentation": "requested | dispensed | received | failed | cancelled"
            },
            {
              "name": "dispenseid",
              "definition": "http://hl7.org/fhir/profiles/Supply",
              "type": "token",
              "documentation": "External identifier"
            },
            {
              "name": "_language",
              "definition": "http://hl7.org/fhir/profiles/Supply",
              "type": "token",
              "documentation": "The stated language of the resource"
            },
            {
              "name": "identifier",
              "definition": "http://hl7.org/fhir/profiles/Supply",
              "type": "token",
              "documentation": "Unique identifier"
            },
            {
              "name": "supplier",
              "definition": "http://hl7.org/fhir/profiles/Supply",
              "type": "reference",
              "documentation": "Dispenser"
            },
            {
              "name": "kind",
              "definition": "http://hl7.org/fhir/profiles/Supply",
              "type": "token",
              "documentation": "The kind of supply (central, non-stock, etc)"
            },
            {
              "name": "dispensestatus",
              "definition": "http://hl7.org/fhir/profiles/Supply",
              "type": "token",
              "documentation": "in progress | dispensed | abandoned"
            }
          ]
        },
        {
          "type": "ValueSet",
          "profile": {
            "reference": "http://hl7.org/fhir/ValueSet"
          },
          "operation": [
            {
              "code": "read"
            },
            {
              "code": "vread"
            },
            {
              "code": "update"
            },
            {
              "code": "delete"
            },
            {
              "code": "history-instance"
            },
            {
              "code": "validate"
            },
            {
              "code": "history-type"
            },
            {
              "code": "create"
            },
            {
              "code": "search-type"
            }
          ],
          "searchParam": [
            {
              "name": "system",
              "definition": "http://hl7.org/fhir/profiles/ValueSet",
              "type": "token",
              "documentation": "The system for any codes defined by this value set"
            },
            {
              "name": "_id",
              "definition": "http://hl7.org/fhir/profiles/ValueSet",
              "type": "token",
              "documentation": "The logical resource id associated with the resource (must be supported by all servers)"
            },
            {
              "name": "status",
              "definition": "http://hl7.org/fhir/profiles/ValueSet",
              "type": "token",
              "documentation": "The status of the value set"
            },
            {
              "name": "description",
              "definition": "http://hl7.org/fhir/profiles/ValueSet",
              "type": "string",
              "documentation": "Text search in the description of the value set"
            },
            {
              "name": "name",
              "definition": "http://hl7.org/fhir/profiles/ValueSet",
              "type": "string",
              "documentation": "The name of the value set"
            },
            {
              "name": "_language",
              "definition": "http://hl7.org/fhir/profiles/ValueSet",
              "type": "token",
              "documentation": "The stated language of the resource"
            },
            {
              "name": "code",
              "definition": "http://hl7.org/fhir/profiles/ValueSet",
              "type": "token",
              "documentation": "A code defined in the value set"
            },
            {
              "name": "date",
              "definition": "http://hl7.org/fhir/profiles/ValueSet",
              "type": "date",
              "documentation": "The value set publication date"
            },
            {
              "name": "identifier",
              "definition": "http://hl7.org/fhir/profiles/ValueSet",
              "type": "token",
              "documentation": "The identifier of the value set"
            },
            {
              "name": "reference",
              "definition": "http://hl7.org/fhir/profiles/ValueSet",
              "type": "token",
              "documentation": "A code system included or excluded in the value set or an imported value set"
            },
            {
              "name": "publisher",
              "definition": "http://hl7.org/fhir/profiles/ValueSet",
              "type": "string",
              "documentation": "Name of the publisher of the value set"
            },
            {
              "name": "version",
              "definition": "http://hl7.org/fhir/profiles/ValueSet",
              "type": "token",
              "documentation": "The version identifier of the value set"
            }
          ]
        }
      ],
      "operation": [
        {
          "code": "transaction"
        },
        {
          "code": "history-system"
        },
        {
          "code": "search-system"
        }
      ]
    }
  ]
}
},{}]},{},[4])