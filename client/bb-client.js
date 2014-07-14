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
      if (kv[0].length > 0) {
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
  }).then(function(authz){
    authz = $.extend(authz, params);
    ret.resolve(authz);
  });

  return ret.promise();
};


BBClient.ready = function(input, callback){

  if (arguments.length === 1){
    callback = input;
    input = null;
  }

  // decide between token flow (implicit grant) and code flow (authorization code grant)
  var isCode = urlParam('code') || (input && input.code);

  var accessTokenResolver = null;
  if (isCode) {
    accessTokenResolver = completeCodeFlow(input);
  } else if (!isCode) {
    accessTokenResolver = completeTokenFlow(input);
  }

  accessTokenResolver.then(function(tokenResponse){

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
    }
    var ret = FhirClient(fhirClientParams);
    ret.state = JSON.parse(JSON.stringify(state));
    ret.tokenResponse = JSON.parse(JSON.stringify(tokenResponse));
    callback && callback(ret);

  });

}

function providers(fhirServiceUrl, callback){

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

BBClient.authorize = function(params){

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
  });
};


