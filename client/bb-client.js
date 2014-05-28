var $ = jQuery = require('./jquery');
var FhirClient = require('./client');
var Guid = require('./guid');

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
    patientId: authorization.patient
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

function providers(fhirServiceUrl, callback){
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

function relative(url){
  return (window.location.protocol + "//" + window.location.host + window.location.pathname).match(/(.*\/)[^\/]*/)[1] + url;
}

function getParameterByName(name) {
  name = name.replace(/[\[]/, "\\\[").replace(/[\]]/, "\\\]");
  var regexS = "[\\?&]" + name + "=([^&#]*)";
  var regex = new RegExp(regexS);
  var results = regex.exec(window.location.search);
  if(results == null)
    return "";
  else
    return decodeURIComponent(results[1].replace(/\+/g, " "));
}

BBClient.authorize = function(params){

  if (!params.client){
    params = {
      client: params
    };
  }
  
  if (!params.client.redirect_uri){
    params.client.redirect_uri = relative("");
  }

  if (!params.client.redirect_uri.match(/:\/\//)){
    params.client.redirect_uri = relative(params.client.redirect_uri);
  }

  var launch = getParameterByName("launch");
  if (launch){
    if (!params.client.scope.match(/launch:/)){
      params.client.scope += " launch:"+launch;
    }
  }

  var server = getParameterByName("iss");
  if (server){
    if (!params.server){
      params.server = server;
    }
  }

  providers(params.server, function(provider){

  params.provider = provider;

  var state = Guid.newGuid();
  var client = params.client;

  if (params.provider.oauth2 == null) {
    localStorage[state] = JSON.stringify(params);
    window.location.href = client.redirect_uri + "#state="+state;
    return;
  }

  localStorage[state] = JSON.stringify(params);

  console.log("sending client reg", params.client);

  var redirect_to=params.provider.oauth2.authorize_uri + "?" + 
    "client_id="+client.client_id+"&"+
    "response_type=token&"+
    "scope="+client.scope+"&"+
    "redirect_uri="+client.redirect_uri+"&"+
    "state="+state;

  window.location.href = redirect_to;
  });
};


