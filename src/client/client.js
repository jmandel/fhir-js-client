const btoa        = require("btoa");
const Adapter     = require("./adapter");
const HttpError   = require("../HttpError");
const clientUtils = require("./utils");
const {
    absolute,
    getPath,
    setPath,
    makeArray
} = require("../lib");





function connectFhirJs(client, adapter)
{
    let clientApi, patientApi;

    const options = {
        baseUrl: client.options.serviceUrl.replace(/\/$/, ""),
        auth: {
            ...client.options.auth
        }
    };

    if (options.auth.type == "bearer") {
        options.auth.bearer = client.options.auth.token;
        delete options.auth.token;
    }

    Object.defineProperty(client, "api", {
        enumerable: true,
        get() {
            // console.warn("Using client.api is deprecated!");
            if (!clientApi) {
                clientApi = createAPI(adapter, options);
            }
            return clientApi;
        }    
    });

    if (client.patient && client.patient.id) {
        Object.defineProperty(client.patient, "api", {
            enumerable: true,
            get() {
                // console.warn("Using client.patient.api is deprecated!");
                if (!patientApi) {
                    patientApi = createAPI(adapter, {
                        ...options,
                        patient: client.patient.id
                    });
                }
                return patientApi;
            }    
        });
    }
}

function createAPI(adapter, options)
{
    const api = adapter.fhirjs(options, adapter);

    for (const name in api) {
        if (api.hasOwnProperty(name) && typeof api[name] == "function") {
            api[name] = (function(orig) {
                return (...args) => orig.apply(api, args).catch(failure => {
                    throw HttpError.create(failure);
                });
            })(api[name]);
        }
    }

    return api;
}


module.exports = FhirClient;

function ClientPrototype(){}
Object.keys(clientUtils).forEach(function(k){
    ClientPrototype.prototype[k] = clientUtils[k];
});

/**
 * @param {Object} p
 * @param {String} p.serviceUrl 
 * @param {Object} p.auth 
 * @param {String} p.userId
 * @param {String} p.patientId
 * @param {String} p.auth.type
 * @param {String} p.auth.token
 * @param {String} p.auth.username
 * @param {String} p.auth.password
 */
function FhirClient(p) {

    // Accept string as argument
    if (typeof p == "string") {
        p = { serviceUrl: p };
    }

    // Valid serviceUrl is required!
    if (!p.serviceUrl || !p.serviceUrl.match(/https?:\/\/.+/)) {
        throw new Error(
            "A `serviceUrl` option is required and must begin with 'http(s)'"
        );
    }

    // Build the options object
    const options = {
        serviceUrl: p.serviceUrl,
        userId    : p.userId || null,
        patientId : p.patientId || null,
        auth: {
            type: "none"
        }
    };

    if (p.auth && typeof p.auth == "object") {
        const { username: user, password: pass, type, token } = p.auth;
        if (type === "basic") {
            if (!user) {
                throw new Error("A 'username' option is required for basic auth");
            }
            if (!pass) {
                throw new Error("A 'password' option is required for basic auth");
            }
            options.auth = { type, user, pass };
        }
        else if (type === "bearer") {
            if (!token) {
                throw new Error("A 'token' option is required for bearer auth");
            }
            options.auth = { type, token };
        }
    }

    const adapter = Adapter.get();
    const client = new ClientPrototype();

    client.options = options;
    client.getPath = getPath;
    // -------------------------------------------------------------------------
    
    client.patient = {
        id: options.patientId,
        read() {
            if (!options.patientId) {
                throw new Error(
                    "Patient is not known! You have to request launch or " +
                    "launch/Patient scope, or pass a patientId option to the client"
                );
            }
            return client.request(`Patient/${options.patientId}`);
        }
    };

    client.user = {
        id: options.userId,
        read() {
            if (!options.userId) {
                throw new Error(
                    "User is not known! You have to request openid and fhirUser " +
                    "scopes, or pass an userId option to the client"
                );
            }
            return client.request(options.userId);
        }
    };
    
    connectFhirJs(client, adapter);

    function authenticated(p) {
        if (options.auth.type === "none") {
            return p;
        }

        let h;
        if (options.auth.type === "basic") {
            h = "Basic " + btoa(options.auth.user + ":" + options.auth.pass);
        } else if (options.auth.type === "bearer") {
            h = "Bearer " + options.auth.token;
        }

        if (!p.headers) {
            p.headers = {};
        }
        
        p.headers.Authorization = h;

        return p;
    }

    // =========================================================================

    /**
     * @param {Object|String} requestOptions Can be a string URL (relative to
     * the serviceUrl), or an object which will be passed to jQuery.ajax()
     * @param {Object} fhirOptions Additional options to control the behaviour
     * @param {Boolean} fhirOptions.useRefreshToken If false, the request will
     * fail if your access token is expired. If true (default), when you receive
     * a 401 response and you have a refresh token, the client will attempt to
     * re-authorize and try again.
     * @param {Number} fhirOptions.pageLimit When you request something that
     * returns a bundle and has multiple pages, the next (pageLimit - 1) pages
     * will also be requested and appended to the result. You can use it like so:
     * - fhirOptions.pageLimit = 1 - (default) Only get the current page
     * - fhirOptions.pageLimit = 3 - Get the first 3 pages
     * - fhirOptions.pageLimit = 0 - Get all pages
     * @param {String|String[]} fhirOptions.resolveReferences One or more
     * references to resolve. 
     * @param {Boolean} fhirOptions.graph Ignored if `fhirOptions.resolveReferences`
     * is not used. If you use `fhirOptions.resolveReferences` and leave 
     * `fhirOptions.graph` as false, the result promise will be resolved with an
     * object like `{ data: Bundle, references: [ ...Resource ] }`.
     * If you set `fhirOptions.graph` to true, the resolved references will be
     * mounted in place and you just get the data property: `{ data: Bundle }`.
     */
    client.request = function(requestOptions, fhirOptions = {}, _resolvedRefs = {}) {
        
        // requestOptions.url
        if (typeof requestOptions == "string") {
            requestOptions = { url: requestOptions };
        }
        requestOptions.url = absolute(requestOptions.url, options.serviceUrl);

        // authentication
        requestOptions = authenticated(requestOptions);

        // fhirOptions.resolveReferences
        if (!Array.isArray(fhirOptions.resolveReferences)) {
            fhirOptions.resolveReferences = [fhirOptions.resolveReferences];
        }
        fhirOptions.resolveReferences = fhirOptions.resolveReferences.filter(Boolean).map(String);

        // fhirOptions.graph
        fhirOptions.graph = (fhirOptions.graph !== false);

        // fhirOptions.pageLimit
        if (!fhirOptions.pageLimit && fhirOptions.pageLimit !== 0) {
            fhirOptions.pageLimit = 1;
        }

        const hasPageCallback = typeof fhirOptions.onPage == "function";

        return adapter.http(requestOptions)
            .catch(result => {
                if (result.error.status == 401 && fhirOptions.useRefreshToken !== false) {
                    const hasRefreshToken = getPath(client, "tokenResponse.refresh_token");
                    if (hasRefreshToken) {
                        return client.refresh().then(() => adapter.http(requestOptions));
                    }
                }
                return Promise.reject(result.error);
            })
            .then(result => {
                return result.data;
            })

            // Resolve References
            .then(async (data) => {

                async function resolve(obj) {
                    for (let path of fhirOptions.resolveReferences) {
                        const ref = getPath(obj, path + ".reference");
                        if (ref) {
                            let sub = _resolvedRefs[ref];
                            if (!sub) {
                                sub = await client.request(ref);
                                _resolvedRefs[ref] = sub;
                            }


                            if (fhirOptions.graph) {
                                setPath(obj, path, sub);
                            }
                        }
                    }
                }

                if (data && data.resourceType == "Bundle") {
                    for (let item of (data.entry || [])) {
                        await resolve(item.resource);
                        // console.log(resource);
                    }
                } else {
                    await resolve(data);
                }

                return data;
            })

            // Pagination
            .then(async (data) => {
                if (data && data.resourceType == "Bundle") {
                    if (hasPageCallback) {
                        await fhirOptions.onPage(data, { ..._resolvedRefs });
                    }

                    if (--fhirOptions.pageLimit) {
                        const links = data.link || [];
                        const next = links.find(l => l.relation == "next");
                        data = makeArray(data);
                        // console.log("===>", data);
                        if (next && next.url) {
                            const nextPage = await client.request(next.url, fhirOptions, _resolvedRefs);

                            if (hasPageCallback) {
                                return null;
                            }
                            // console.log("===>", nextPage);
                            if (fhirOptions.resolveReferences.length) {
                                Object.assign(_resolvedRefs, nextPage.references);
                                // console.log("===>", nextPage);
                                return data.concat(makeArray(nextPage.data || nextPage));
                            }
                            return data.concat(makeArray(nextPage));
                        }
                    }
                    
                }
                
                return data;
            })
            
            .then(data => {
                if (fhirOptions.graph) {
                    _resolvedRefs = {};
                }
                else if (!hasPageCallback && fhirOptions.resolveReferences.length) {
                    return {
                        data,
                        references: _resolvedRefs
                    };
                }
                return data;
            })
            
            .catch(failure => {
                // console.log(failure)
                throw HttpError.create(failure);
            });
    };

    /**
     * Use the refresh token to obtain new access token. If the refresh token is
     * expired (or this fails for any other reason) it will be deleted from the
     * state, so that we don't enter into loops trying to re-authorize.
     */
    client.refresh = function() {
        const refreshToken = getPath(this, "tokenResponse.refresh_token");

        // If one calls this method manually and has no refresh token we throw
        // an error. But if it called internally (E.g. from `request`), this
        // shouldn't happen because the caller will check for refresh token
        // before calling this method.
        if (!refreshToken) {
            throw new Error("Trying to refresh but there is no refresh token");
        }

        const tokenUri = getPath(this, "state.provider.oauth2.token_uri");

        // This shouldn't happen unless people mess with their sessionStorage
        if (!tokenUri) {
            throw new Error("`provider.oauth2.token_uri` not found in state");
        }

        return client.request({
            url: tokenUri,
            type: "POST",
            headers: {
                "content-type": "application/x-www-form-urlencoded"
            },
            body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`
        }).then(data => {
            client.tokenResponse = {
                ...client.tokenResponse,
                ...data
            };
            client.options.auth.token = data.access_token;
            sessionStorage.tokenResponse = JSON.stringify(client.tokenResponse);
            return data;
        }).catch(error => {
            // debug(error);
            // debug("Deleting the expired or invalid refresh token");
            delete client.tokenResponse.refresh_token;
            throw error;
        });
    };

    client.getBinary = function(url) {

        var ret = adapter.defer();

        adapter.http(authenticated({
            type: "GET",
            url: url,
            dataType: "blob"
        })).done(function(blob){
            ret.resolve(blob);
        }).fail(function(){
            ret.reject("Could not fetch " + url, arguments);
        });
        return ret.promise;
    };

    client.fetchBinary = function(path) {
        var url = absolute(path, options.serviceUrl);
        return client.getBinary(url);
    };

    return client;
}
