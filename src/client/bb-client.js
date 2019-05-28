var jwt        = require("jsonwebtoken");
var Adapter    = require("./adapter");
var FhirClient = require("./client");
var Guid       = require("./guid");
var Lib        = require("../lib");

var BBClient = {
    debug: true,

    // Client settings
    settings: {
        // Replaces the browser's current URL
        // using window.history.replaceState API.
        // Default to true
        replaceBrowserHistory: true,
        
        // When set to true, this variable will fully utilize
        // HTML5 sessionStorage API.
        // Default to true
        // This variable can be overridden to false by setting
        // FHIR.oauth2.settings.fullSessionStorageSupport = false.
        // When set to false, the sessionStorage will be keyed 
        // by a state variable. This is to allow the embedded IE browser
        // instances instantiated on a single thread to continue to
        // function without having sessionStorage data shared 
        // across the embedded IE instances.
        fullSessionStorageSupport: true
    }
};

module.exports = {
    BBClient,
    getPreviousToken
};

/**
* Get the previous token stored in sessionStorage
* based on fullSessionStorageSupport flag.
* @return object JSON tokenResponse
*/
function getPreviousToken() {
    if (BBClient.settings.fullSessionStorageSupport) {
        return JSON.parse(sessionStorage.tokenResponse);
    } else {
        var state = Lib.urlParam("state");
        return JSON.parse(sessionStorage[state]).tokenResponse;
    }
}

function completeTokenFlow(hash){
    if (!hash){
        hash = window.location.hash;
    }
    var ret = Adapter.get().defer();

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

    return ret.promise;
}

function completeCodeFlow(params){
    if (!params){
        params = {
            code : Lib.urlParam("code"),
            state: Lib.urlParam("state")
        };
    }
    
    var ret = Adapter.get().defer();
    var state = JSON.parse(sessionStorage[params.state]);

    if (window.history.replaceState && BBClient.settings.replaceBrowserHistory){
        window.history.replaceState({}, "", window.location.toString().replace(window.location.search, ""));
    } 

    // Using window.history.pushState to append state to the query param.
    // This will allow session data to be retrieved via the state param.
    if (window.history.pushState && !BBClient.settings.fullSessionStorageSupport) {
      
        var queryParam = window.location.search;
        if (window.location.search.indexOf("state") == -1) {
            // Append state query param to URI for later.
            // state query param will be used to look up
            // token response upon page reload.

            queryParam += (window.location.search ? "&" : "?");
            queryParam += "state=" + params.state;
            
            var url = window.location.protocol + "//" + 
                                window.location.host + 
                                window.location.pathname + 
                                queryParam;

            window.history.pushState({}, "", url);
        }
    }

    var data = {
        code: params.code,
        grant_type: "authorization_code",
        redirect_uri: state.client.redirect_uri
    };

    var headers = {};

    if (state.client.secret) {
        headers["Authorization"] = `Basic ${btoa(state.client.client_id + ":" + state.client.secret)}`;
    } else {
        data.client_id = state.client.client_id;
    }

    Adapter.get().http({
        method: "POST",
        url: state.provider.oauth2.token_uri,
        data: data,
        headers: headers
    }).then(function(authz) {
        var result = authz.data;
        for (var i in params) {
            if (params.hasOwnProperty(i)) {
                result[i] = params[i];
            }
        }
        ret.resolve(result);
    }, function(){
        console.log("failed to exchange code for access_token", arguments);
        ret.reject();
    });

    return ret.promise;
}

/**
 * This code is needed for the page refresh/reload workflow.
 * When the access token is nearing expiration or is expired,
 * this function will make an ajax POST call to obtain a new
 * access token using the current refresh token.
 * @return promise object
 */
function completeTokenRefreshFlow() {
    var ret = Adapter.get().defer();
    var tokenResponse = getPreviousToken();
    var state = JSON.parse(sessionStorage[tokenResponse.state]);
    var refresh_token = tokenResponse.refresh_token;

    Adapter.get().http({
        method: "POST",
        url: state.provider.oauth2.token_uri,
        data: {
            grant_type: "refresh_token",
            refresh_token: refresh_token
        },
    }).then(function(authz) {
        ret.resolve($.extend(tokenResponse, authz.data));
    }, function() {
        console.warn("Failed to exchange refresh_token for access_token", arguments);
        ret.reject(
            "Failed to exchange refresh token for access token. " +
            "Please close and re-launch the application again."
        );
    });

    return ret.promise;
}

function completePageReload(){
    var d = Adapter.get().defer();
    process.nextTick(function(){
        d.resolve(getPreviousToken());
    });
    return d;
}


/**
* Check the tokenResponse object to see if it is valid or not.
* This is to handle the case of a refresh/reload of the page
* after the token was already obtain.
* @return boolean
*/
function validTokenResponse() {
    if (BBClient.settings.fullSessionStorageSupport && sessionStorage.tokenResponse) {
        return true;
    } else {
        if (!BBClient.settings.fullSessionStorageSupport) {
            var state = Lib.urlParam("state") || (args.input && args.input.state);
            return (state && sessionStorage[state] && JSON.parse(sessionStorage[state]).tokenResponse);
        }
    }
    return false;
}

function isFakeOAuthToken(){
    if (validTokenResponse()) {
        var token = getPreviousToken();
        if (token && token.state) {
            var state = JSON.parse(sessionStorage[token.state] || "{}");
            return state.fake_token_response;
        }
    }
    return false;
}

BBClient.ready = function(/*input, callback, errback*/) {

    var args = Lib.readyArgs.apply(this, arguments);

    // decide between token flow (implicit grant) and code flow (authorization code grant)
    var isCode = Lib.urlParam("code") || (args.input && args.input.code);

    var accessTokenResolver = null;

    if (isFakeOAuthToken()) {
        accessTokenResolver = completePageReload();
        // In order to remove the state query parameter in the URL, both replaceBrowserHistory
        // and fullSessionStorageSupport setting flags must be set to true. This allows querying the state
        // through sessionStorage. If the browser does not support the replaceState method for the History Web API,
        // or if either of the setting flags are false, the state property will be retrieved
        // from the state query parameter in the URL.
        if (window.history.replaceState
          && BBClient.settings.replaceBrowserHistory
          && BBClient.settings.fullSessionStorageSupport)
        {
            window.history.replaceState({}, "", window.location.toString().replace(window.location.search, ""));
        }
    } else {
        if (validTokenResponse()) { // we're reloading after successful completion
        
            // Check if 2 minutes from access token expiration timestamp
            var tokenResponse = getPreviousToken();
            var payloadCheck = jwt.decode(tokenResponse.access_token);
            var nearExpTime = Math.floor(Date.now() / 1000) >= (payloadCheck.exp - 120);
            
            if (tokenResponse.refresh_token
              && tokenResponse.scope.indexOf("online_access") > -1
              && nearExpTime) { // refresh token flow
                accessTokenResolver = completeTokenRefreshFlow();
            } else { // existing access token flow
                accessTokenResolver = completePageReload();
            }
        } else if (isCode) { // code flow
            
            accessTokenResolver = completeCodeFlow(args.input);
        } else { // token flow
            accessTokenResolver = completeTokenFlow(args.input);
        }
    }
    accessTokenResolver.done(function(tokenResponse){
        if (!tokenResponse || !tokenResponse.state) {
            return args.errback("No 'state' parameter found in authorization response.");
        }

        // Save the tokenResponse object into sessionStorage
        if (BBClient.settings.fullSessionStorageSupport) {
            sessionStorage.tokenResponse = JSON.stringify(tokenResponse);
        } else {
            //Save the tokenResponse object and the state into sessionStorage keyed by state
            var combinedObject = $.extend(true, JSON.parse(sessionStorage[tokenResponse.state]), { tokenResponse });
            sessionStorage[tokenResponse.state] = JSON.stringify(combinedObject);
        }
        
        var state = JSON.parse(sessionStorage[tokenResponse.state] || "{}");
        if (state.fake_token_response) {
            tokenResponse = state.fake_token_response;
        }

        var fhirClientParams = {
            serviceUrl: state.provider.url,
            patientId: tokenResponse.patient
        };
        
        if (tokenResponse.id_token) {
            var id_token = tokenResponse.id_token;
            var payload = jwt.decode(id_token);
            fhirClientParams.userId = payload.fhirUser || payload.profile;
        }
        
        if (tokenResponse.access_token !== undefined) {
            fhirClientParams.auth = {
                type: "bearer",
                token: tokenResponse.access_token
            };
        } else if (!state.fake_token_response){
            return args.errback("Failed to obtain access token.");
        }

        try {
            var ret = FhirClient(fhirClientParams);
            ret.state = JSON.parse(JSON.stringify(state));
            ret.tokenResponse = JSON.parse(JSON.stringify(tokenResponse));
            args.callback(ret);
        } catch (err) {
            args.errback(err);
        }
        
    }).fail(function(ret){
        ret ? args.errback(ret) : args.errback("Failed to obtain access token.");
    });

};

function providers(fhirServiceUrl, provider, callback, errback){

    // Shim for pre-OAuth2 launch parameters
    if (isBypassOAuth()){
        process.nextTick(function(){
            bypassOAuth(fhirServiceUrl, callback);
        });
        return;
    }

    // Skip conformance statement introspection when overriding provider setting are available
    if (provider) {
        provider.url = fhirServiceUrl;
        process.nextTick(function(){
            callback && callback(provider);
        });
        return;
    }

    Adapter.get().http({
        method: "GET",
        url: Lib.stripTrailingSlash(fhirServiceUrl) + "/metadata"
    }).then(
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
                var smartExtension = r.data.rest[0].security.extension.filter(function (e) {
                    return (e.url === "http://fhir-registry.smarthealthit.org/StructureDefinition/oauth-uris");
                });

                smartExtension[0].extension.forEach(function(arg){
                    if (arg.url === "register") {
                        res.oauth2.registration_uri = arg.valueUri;
                    } else if (arg.url === "authorize") {
                        res.oauth2.authorize_uri = arg.valueUri;
                    } else if (arg.url === "token") {
                        res.oauth2.token_uri = arg.valueUri;
                    }
                });
            }
            catch (err) {
                return errback && errback(err);
            }

            callback && callback(res);
        }, function() {
            errback && errback("Unable to fetch conformance statement");
        }
    );
}

// var noAuthFhirProvider = function(serviceUrl){
//     return {
//         "oauth2": null,
//         "url": serviceUrl
//     };
// };

function isBypassOAuth(){
    return (Lib.urlParam("fhirServiceUrl") && !(Lib.urlParam("iss")));
}

function bypassOAuth(fhirServiceUrl, callback){
    callback && callback({
        "oauth2": null,
        "url": fhirServiceUrl || Lib.urlParam("fhirServiceUrl")
    });
}


BBClient.preAuthorize = function(params, callback, errback) {

    if (!errback){
        errback = function(){
            console.log("Failed to discover authorization URL given", params);
        };
    }
    
    // prevent inheritance of tokenResponse from parent window
    delete sessionStorage.tokenResponse;

    if (!params.client){
        params = {
            client: params
        };
    }

    if (!params.response_type){
        params.response_type = "code";
    }

    if (!params.client.redirect_uri){
        params.client.redirect_uri = Lib.relative("");
    }

    if (!params.client.redirect_uri.match(/:\/\//)){
        params.client.redirect_uri = Lib.relative(params.client.redirect_uri);
    }

    var launch = Lib.urlParam("launch");
    if (launch){
        if (!params.client.scope.match(/launch/)){
            params.client.scope += " launch";
        }
        params.client.launch = launch;
    }

    var server = Lib.urlParam("iss") || Lib.urlParam("fhirServiceUrl");
    if (server){
        if (!params.server){
            params.server = server;
        }
    }

    if (!params.server) {
        console.warn(
            "No server provided. For EHR launch, the EHR should provide that as \"iss\" " +
            "parameter. For standalone launch you should pass a \"server\" option " +
            "to the authorize function. Alternatively, you can also pass " +
            "\"fhirServiceUrl\" parameter to your launch url."
        );
        return errback();
    }

    if (Lib.urlParam("patientId")){
        params.fake_token_response = params.fake_token_response || {};
        params.fake_token_response.patient = Lib.urlParam("patientId");
    }

    providers(params.server, params.provider, function(provider){

        params.provider = provider;

        var state = params.client.state || Guid.newGuid();
        var client = params.client;

        if (params.provider.oauth2 == null) {

            // Adding state to tokenResponse object
            if (BBClient.settings.fullSessionStorageSupport) { 
                sessionStorage[state] = JSON.stringify(params);
                sessionStorage.tokenResponse = JSON.stringify({ state });
            } else {
                var combinedObject = $.extend(true, params, { tokenResponse : { state } });
                sessionStorage[state] = JSON.stringify(combinedObject);
            }

            window.location.href = client.redirect_uri + "?state="+encodeURIComponent(state);
            return;
        }
      
        sessionStorage[state] = JSON.stringify(params);

        console.log("sending client reg", params.client);

        var redirect_to=params.provider.oauth2.authorize_uri + "?" + 
        "client_id="+encodeURIComponent(client.client_id)+"&"+
        "response_type="+encodeURIComponent(params.response_type)+"&"+
        "scope="+encodeURIComponent(client.scope)+"&"+
        "redirect_uri="+encodeURIComponent(client.redirect_uri)+"&"+
        "state="+encodeURIComponent(state)+"&"+
        "aud="+encodeURIComponent(params.server);
      
        if (typeof client.launch !== "undefined" && client.launch) {
            redirect_to += "&launch="+encodeURIComponent(client.launch);
        }

        callback(redirect_to);
    }, errback);
};

BBClient.authorize = function(params, errback) {
    BBClient.preAuthorize(params, redirect => {
        window.location.href = redirect;
    }, errback);
};

BBClient.resolveAuthType = function (fhirServiceUrl, callback, errback) {

    Adapter.get().http({
        method: "GET",
        url: Lib.stripTrailingSlash(fhirServiceUrl) + "/metadata"
    }).then(function(r){
        var type = "none";

        try {
            if (r.data.rest[0].security.service[0].coding[0].code.toLowerCase() === "smart-on-fhir") {
                type = "oauth2";
            }
        }
        catch (err) {
            // ignore
        }

        callback && callback(type);
    }, function() {
        errback && errback("Unable to fetch conformance statement");
    });
};
