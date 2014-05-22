var $ = jQuery = require('./jquery');
var FhirClient = require('./client');

var BBClient = module.exports =  {debug: true}
BBClient.jQuery = BBClient.$ = jQuery;

BBClient.ready = function(hash, callback){

  var mustClearHash = false;
  if (arguments.length == 1){
    mustClearHash = true;
    callback = hash;
    hash =  window.location.hash;
  }

  var oauthResult = hash.match(/#(.*)/);
  oauthResult = oauthResult ? oauthResult[1] : "";
  oauthResult = oauthResult.split(/&/);

  BBClient.authorization = null;
  BBClient.state = null;

  var authorization = {};
  for (var i = 0; i < oauthResult.length; i++){
    var kv = oauthResult[i].split(/=/);
    if (kv[0].length > 0) {
      authorization[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1]);
    }
  }

  if (Object.keys(authorization).length > 0 && authorization.state){
    BBClient.authorization = authorization;
    BBClient.state = JSON.parse(localStorage[BBClient.authorization.state]);
  } else {
    return;
  }

  console.log(BBClient);

  // don't expose hash in the URL while in production mode
  if (mustClearHash && BBClient.debug !== true) {
    window.location.hash="";
  }

  var fhirClientParams = BBClient.fhirAuth = {
    serviceUrl: BBClient.state.provider.bb_api.fhir_service_uri,
    patientId: BBClient.state.patientId
  };

  if (BBClient.authorization.access_token !== undefined) {
    fhirClientParams.auth = {
      type: 'bearer',
      token: BBClient.authorization.access_token
    };
  }
  process.nextTick(function(){
    callback && callback(FhirClient(fhirClientParams))
  });
}

BBClient.providers = function(fhirServiceUrl, callback){
    jQuery.get(
      fhirServiceUrl+"/metadata",
      function(r){
          var res = {
              "name": "SMART on FHIR Testing Server",
              "description": "Dev server for SMART on FHIR",
              "url": null,
              "oauth2": {
                "registration_uri": null,
                "authorize_uri": null,
                "token_uri": null
              },
              "bb_api":{
                "fhir_service_uri": fhirServiceUrl,
                "search": fhirServiceUrl + "/DocumentReference"
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

BBClient.noAuthFhirProvider = function(serviceUrl){
  return  {
    "oauth2": null,
    "bb_api":{
      "fhir_service_uri": serviceUrl
    }
  }
};


BBClient.authorize = function(params){

  var state = Guid.newGuid();
  var client = params.client;

  if (params.provider.oauth2 == null) {
    localStorage[state] = JSON.stringify(params);
    return window.location.href = client.redirect_uris[0] + "#state="+state;
  }

  // 1. register to obtain a client_id
  var post = {
    type: "POST",
    headers: {"Authorization" : "Bearer " + params.preregistration_token},
    contentType: "application/json",
    url: params.provider.oauth2.registration_uri,
    data:JSON.stringify(client)
  }
  if (!params.preregistration_token){
    delete post.headers;
  }

  // 2. then authorize to access records
  jQuery.ajax(post).success(function(client){
    console.log("Got client", JSON.stringify(client, null,2 ));

    params.client = client;

    localStorage[state] = JSON.stringify(params);

    var authScope;
    if (params.patientId) {
      authScope = encodeURIComponent("search:"+params.patientId);
    } else {
      authScope = client.scope
    }
    console.log("sending client reg", params.client);

    var redirect_to=params.provider.oauth2.authorize_uri + "?" + 
      "client_id="+client.client_id+"&"+
      "response_type=token&"+
      "scope="+authScope+"&"+
      "redirect_uri="+client.redirect_uris[0]+"&"+
      "state="+state;
    window.location.href = redirect_to;
  });
};

BBClient.summary = function(){
  return jQuery.ajax({
    type: "GET",
    dataType: "text",
    headers: {"Authorization" : "Bearer " + BBClient.authorization.access_token},
    url: BBClient.state.provider.bb_api.summary
  });
};

var Guid = Guid || (function () {

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

  return {
    newGuid: create,
    empty: EMPTY
  };})(); 
