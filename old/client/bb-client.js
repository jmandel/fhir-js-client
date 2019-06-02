const jwt        = require("jsonwebtoken");
const Adapter    = require("./adapter");
const FhirClient = require("./client");
const Guid       = require("./guid");
const Lib        = require("../lib");
const Storage    = require("../Storage");
const smart      = require("../smart");

const BBClient = {

    // This will be true in dev builds and false in production (minified versions)
    debug: process.env.NODE_ENV == "development",

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

module.exports = BBClient;

const storage = new Storage(BBClient.settings);

function completeTokenFlow(hash){
    if (!hash){
        hash = window.location.hash;
    }
    var ret = Adapter.get().defer();

    setTimeout(function(){
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
    }, 0);

    return ret.promise;
}

function completeCodeFlow(params){
    if (!params){
        params = {
            code : Lib.urlParam("code"),
            state: Lib.urlParam("state")
        };
    }
    
    var ret   = Adapter.get().defer();
    var state = storage.get(params.state);

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

function completePageReload() {
    var d = Adapter.get().defer();
    setTimeout(function(){
        d.resolve(storage.getTokenResponse());
    }, 0);
    return d;
}

function isFakeOAuthToken(){
    const token = storage.getTokenResponse();
    if (token && token.state) {
        const state = storage.get(token.state);
        return state && state.fake_token_response;
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
        const tokenResponse = storage.getTokenResponse();
        if (tokenResponse) { // we're reloading after successful completion
            accessTokenResolver = completePageReload();
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
            const state = storage.get(tokenResponse.state) || {};
            const combinedObject = {
                ...state,
                tokenResponse: {
                    ...state.tokenResponse,
                    tokenResponse
                }
            };
            sessionStorage[tokenResponse.state] = JSON.stringify(combinedObject);
        }
        
        var state = storage.get(tokenResponse.state) || {};
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
        setTimeout(function(){
            bypassOAuth(fhirServiceUrl, callback);
        }, 0);
        return;
    }

    // Skip conformance statement introspection when overriding provider setting are available
    if (provider) {
        provider.url = fhirServiceUrl;
        setTimeout(function(){
            callback && callback(provider);
        }, 0);
        return;
    }

    smart.getSecurityExtensions(fhirServiceUrl).then(
        ext => callback && callback({
            "name": "SMART on FHIR Testing Server",
            "description": "Dev server for SMART on FHIR",
            "url": fhirServiceUrl,
            "oauth2": {
                "registration_uri": ext.registrationUri,
                "authorize_uri": ext.authorizeUri,
                "token_uri": ext.tokenUri
            }
        }),
        err => errback && errback(err)
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
                var combinedObject = {
                    ...params,
                    tokenResponse : {
                        state
                    }
                };
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

// $lab:coverage:off$
BBClient.authorize = function(params, errback) {
    BBClient.preAuthorize(params, redirect => {
        window.location.href = redirect;
    }, errback);
};
// $lab:coverage:on$
