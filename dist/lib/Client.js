"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const lib_1 = require("./lib");
const strings_1 = require("./strings");
const smart_1 = require("./smart");
const settings_1 = require("./settings");
// $lab:coverage:off$
// @ts-ignore
// eslint-disable-next-line no-undef
const { Response } = global.FHIRCLIENT_PURE ? window : require("cross-fetch");
// $lab:coverage:on$
const debug = lib_1.debug.extend("client");
/**
 * Adds patient context to requestOptions object to be used with
 * fhirclient.Client.request
 * @param requestOptions Can be a string URL (relative to the serviceUrl), or an
 * object which will be passed to fetch()
 * @param client Current FHIR client object containing patient context
 * @return requestOptions object contextualized to current patient
 */
async function contextualize(requestOptions, client) {
    const base = lib_1.absolute("/", client.state.serverUrl);
    async function contextualURL(_url) {
        const resourceType = _url.pathname.split("/").pop();
        if (!resourceType) {
            throw new Error(`Invalid url "${_url}"`);
        }
        if (settings_1.patientCompartment.indexOf(resourceType) == -1) {
            throw new Error(`Cannot filter "${resourceType}" resources by patient`);
        }
        const conformance = await smart_1.fetchConformanceStatement(client.state.serverUrl);
        const searchParam = lib_1.getPatientParam(conformance, resourceType);
        _url.searchParams.set(searchParam, client.patient.id);
        return _url.href;
    }
    if (typeof requestOptions == "string" || requestOptions instanceof URL) {
        return { url: await contextualURL(new URL(requestOptions + "", base)) };
    }
    requestOptions.url = await contextualURL(new URL(requestOptions.url + "", base));
    return requestOptions;
}
/**
 * Gets single reference by id. Caches the result.
 * @param refId
 * @param cache A map to store the resolved refs
 * @param client The client instance
 * @returns The resolved reference
 * @private
 */
function getRef(refId, cache, client) {
    const sub = cache[refId];
    if (!sub) {
        // Note that we set cache[refId] immediately! When the promise is
        // settled it will be updated. This is to avoid a ref being fetched
        // twice because some of these requests are executed in parallel.
        cache[refId] = client.request(refId).then(res => {
            cache[refId] = res;
            return res;
        }, (error) => {
            delete cache[refId];
            throw error;
        });
        return cache[refId];
    }
    return sub;
}
/**
 * Resolves a reference in the given resource.
 * @param {Object} obj FHIR Resource
 */
function resolveRef(obj, path, graph, cache, client) {
    const node = lib_1.getPath(obj, path);
    if (node) {
        const isArray = Array.isArray(node);
        return Promise.all(lib_1.makeArray(node).map((item, i) => {
            const ref = item.reference;
            if (ref) {
                return getRef(ref, cache, client).then(sub => {
                    if (graph) {
                        if (isArray) {
                            lib_1.setPath(obj, `${path}.${i}`, sub);
                        }
                        else {
                            lib_1.setPath(obj, path, sub);
                        }
                    }
                }).catch(() => { });
            }
        }));
    }
}
/**
 * Given a resource and a list of ref paths - resolves them all
 * @param obj FHIR Resource
 * @param {Object} fhirOptions The fhir options of the initiating request call
 * @param cache A map to store fetched refs
 * @param client The client instance
 * @private
 */
function resolveRefs(obj, fhirOptions, cache, client) {
    // 1. Sanitize paths, remove any invalid ones
    let paths = lib_1.makeArray(fhirOptions.resolveReferences)
        .filter(Boolean) // No false, 0, null, undefined or ""
        .map(path => String(path).trim())
        .filter(Boolean); // No space-only strings
    // 2. Remove duplicates
    paths = paths.filter((p, i) => {
        const index = paths.indexOf(p, i + 1);
        if (index > -1) {
            debug("Duplicated reference path \"%s\"", p);
            return false;
        }
        return true;
    });
    // 3. Early exit if no valid paths are found
    if (!paths.length) {
        return Promise.resolve();
    }
    // 4. Group the paths by depth so that child refs are looked up
    // after their parents!
    const groups = {};
    paths.forEach(path => {
        const len = path.split(".").length;
        if (!groups[len]) {
            groups[len] = [];
        }
        groups[len].push(path);
    });
    // 5. Execute groups sequentially! Paths within same group are
    // fetched in parallel!
    let task = Promise.resolve();
    Object.keys(groups).sort().forEach(len => {
        const group = groups[len];
        task = task.then(() => Promise.all(group.map((path) => {
            return resolveRef(obj, path, !!fhirOptions.graph, cache, client);
        })));
    });
    return task;
}
/**
 * @implements { fhirclient.Client }
 */
class Client {
    /**
     * @param {object} environment
     * @param {fhirclient.ClientState|string} state
     */
    constructor(environment, state) {
        this._refreshTask = null;
        // utils -------------------------------------------------------------------
        this.byCode = lib_1.byCode;
        this.byCodes = lib_1.byCodes;
        this.units = lib_1.units;
        this.getPath = lib_1.getPath;
        /**
         * @type fhirclient.ClientState
         */
        const _state = typeof state == "string" ? { serverUrl: state } : state;
        // Valid serverUrl is required!
        if (!_state.serverUrl || !_state.serverUrl.match(/https?:\/\/.+/)) {
            throw new Error("A \"serverUrl\" option is required and must begin with \"http(s)\"");
        }
        this.state = _state;
        this.environment = environment;
        const client = this;
        // patient api ---------------------------------------------------------
        this.patient = {
            get id() { return client.getPatientId(); },
            read: () => {
                const id = this.patient.id;
                return id ?
                    this.request(`Patient/${id}`) :
                    Promise.reject(new Error("Patient is not available"));
            },
            request: (requestOptions, fhirOptions = {}) => {
                if (this.patient.id) {
                    return (async () => {
                        const options = await contextualize(requestOptions, this);
                        return this.request(options, fhirOptions);
                    })();
                }
                else {
                    return Promise.reject(new Error("Patient is not available"));
                }
            }
        };
        // encounter api -------------------------------------------------------
        this.encounter = {
            get id() { return client.getEncounterId(); },
            read: () => {
                const id = this.encounter.id;
                return id ?
                    this.request(`Encounter/${id}`) :
                    Promise.reject(new Error("Encounter is not available"));
            }
        };
        // user api ------------------------------------------------------------
        this.user = {
            get fhirUser() { return client.getFhirUser(); },
            get id() { return client.getUserId(); },
            get resourceType() { return client.getUserType(); },
            read: () => {
                const fhirUser = this.user.fhirUser;
                return fhirUser ?
                    this.request(fhirUser) :
                    Promise.reject(new Error("User is not available"));
            }
        };
        // fhir.js api (attached automatically in browser)
        // ---------------------------------------------------------------------
        this.connect(environment.fhir);
    }
    connect(fhirJs) {
        if (typeof fhirJs == "function") {
            const options = {
                baseUrl: this.state.serverUrl.replace(/\/$/, "")
            };
            const accessToken = lib_1.getPath(this, "state.tokenResponse.access_token");
            if (accessToken) {
                options.auth = { token: accessToken };
            }
            else {
                const { username, password } = this.state;
                if (username && password) {
                    options.auth = {
                        user: username,
                        pass: password
                    };
                }
            }
            this.api = fhirJs(options);
            const patientId = lib_1.getPath(this, "state.tokenResponse.patient");
            if (patientId) {
                this.patient.api = fhirJs(Object.assign(Object.assign({}, options), { patient: patientId }));
            }
        }
        return this;
    }
    /**
     * Returns the ID of the selected patient or null. You should have requested
     * "launch/patient" scope. Otherwise this will return null.
     */
    getPatientId() {
        const tokenResponse = this.state.tokenResponse;
        if (tokenResponse) {
            // We have been authorized against this server but we don't know
            // the patient. This should be a scope issue.
            if (!tokenResponse.patient) {
                if (!(this.state.scope || "").match(/\blaunch(\/patient)?\b/)) {
                    debug(strings_1.default.noScopeForId, "patient", "patient");
                }
                else {
                    // The server should have returned the patient!
                    debug("The ID of the selected patient is not available. Please check if your server supports that.");
                }
                return null;
            }
            return tokenResponse.patient;
        }
        if (this.state.authorizeUri) {
            debug(strings_1.default.noIfNoAuth, "the ID of the selected patient");
        }
        else {
            debug(strings_1.default.noFreeContext, "selected patient");
        }
        return null;
    }
    /**
     * Returns the ID of the selected encounter or null. You should have
     * requested "launch/encounter" scope. Otherwise this will return null.
     * Note that not all servers support the "launch/encounter" scope so this
     * will be null if they don't.
     */
    getEncounterId() {
        const tokenResponse = this.state.tokenResponse;
        if (tokenResponse) {
            // We have been authorized against this server but we don't know
            // the encounter. This should be a scope issue.
            if (!tokenResponse.encounter) {
                if (!(this.state.scope || "").match(/\blaunch(\/encounter)?\b/)) {
                    debug(strings_1.default.noScopeForId, "encounter", "encounter");
                }
                else {
                    // The server should have returned the encounter!
                    debug("The ID of the selected encounter is not available. Please check if your server supports that, and that the selected patient has any recorded encounters.");
                }
                return null;
            }
            return tokenResponse.encounter;
        }
        if (this.state.authorizeUri) {
            debug(strings_1.default.noIfNoAuth, "the ID of the selected encounter");
        }
        else {
            debug(strings_1.default.noFreeContext, "selected encounter");
        }
        return null;
    }
    /**
     * Returns the (decoded) id_token if any. You need to request "openid" and
     * "profile" scopes if you need to receive an id_token (if you need to know
     * who the logged-in user is).
     */
    getIdToken() {
        const tokenResponse = this.state.tokenResponse;
        if (tokenResponse) {
            const idToken = tokenResponse.id_token;
            const scope = this.state.scope || "";
            // We have been authorized against this server but we don't have
            // the id_token. This should be a scope issue.
            if (!idToken) {
                const hasOpenid = scope.match(/\bopenid\b/);
                const hasProfile = scope.match(/\bprofile\b/);
                const hasFhirUser = scope.match(/\bfhirUser\b/);
                if (!hasOpenid || !(hasFhirUser || hasProfile)) {
                    debug("You are trying to get the id_token but you are not " +
                        "using the right scopes. Please add 'openid' and " +
                        "'fhirUser' or 'profile' to the scopes you are " +
                        "requesting.");
                }
                else {
                    // The server should have returned the id_token!
                    debug("The id_token is not available. Please check if your server supports that.");
                }
                return null;
            }
            return lib_1.jwtDecode(idToken);
        }
        if (this.state.authorizeUri) {
            debug(strings_1.default.noIfNoAuth, "the id_token");
        }
        else {
            debug(strings_1.default.noFreeContext, "id_token");
        }
        return null;
    }
    /**
     * Returns the profile of the logged_in user (if any). This is a string
     * having the following shape "{user type}/{user id}". For example:
     * "Practitioner/abc" or "Patient/xyz".
     */
    getFhirUser() {
        const idToken = this.getIdToken();
        if (idToken) {
            return idToken.profile;
        }
        return null;
    }
    /**
     * Returns the user ID or null.
     */
    getUserId() {
        const profile = this.getFhirUser();
        if (profile) {
            return profile.split("/")[1];
        }
        return null;
    }
    /**
     * Returns the type of the logged-in user or null. The result can be
     * "Practitioner", "Patient" or "RelatedPerson".
     */
    getUserType() {
        const profile = this.getFhirUser();
        if (profile) {
            return profile.split("/")[0];
        }
        return null;
    }
    /**
     * Builds and returns the value of the `Authorization` header that can be
     * sent to the FHIR server
     */
    getAuthorizationHeader() {
        const accessToken = lib_1.getPath(this, "state.tokenResponse.access_token");
        if (accessToken) {
            return "Bearer " + accessToken;
        }
        const { username, password } = this.state;
        if (username && password) {
            return "Basic " + lib_1.btoa(username + ":" + password);
        }
        return null;
    }
    async _clearState() {
        const storage = this.environment.getStorage();
        const key = await storage.get(settings_1.SMART_KEY);
        if (key) {
            await storage.unset(key);
        }
        await storage.unset(settings_1.SMART_KEY);
        this.state.tokenResponse = {};
    }
    /**
     * @param resource A FHIR resource to be created
     */
    create(resource) {
        return this.request({
            url: `${resource.resourceType}`,
            method: "POST",
            body: JSON.stringify(resource),
            headers: {
                "Content-Type": "application/fhir+json"
            }
        });
    }
    /**
     * @param resource A FHIR resource to be updated
     */
    update(resource) {
        return this.request({
            url: `${resource.resourceType}/${resource.id}`,
            method: "PUT",
            body: JSON.stringify(resource),
            headers: {
                "Content-Type": "application/fhir+json"
            }
        });
    }
    /**
     * @param url Relative URI of the FHIR resource to be deleted
     * (format: `resourceType/id`)
     */
    delete(url) {
        return this.request({
            url,
            method: "DELETE"
        });
    }
    /**
     * @param requestOptions Can be a string URL (relative to the serviceUrl),
     * or an object which will be passed to fetch()
     * @param fhirOptions Additional options to control the behavior
     * @param _resolvedRefs DO NOT USE! Used internally.
     */
    async request(requestOptions, fhirOptions = {}, _resolvedRefs = {}) {
        var _a;
        const debugRequest = lib_1.debug.extend("client:request");
        if (!requestOptions) {
            throw new Error("request requires an url or request options as argument");
        }
        // url -----------------------------------------------------------------
        let url;
        if (typeof requestOptions == "string" || requestOptions instanceof URL) {
            url = String(requestOptions);
            requestOptions = {};
        }
        else {
            url = String(requestOptions.url);
        }
        url = lib_1.absolute(url, this.state.serverUrl);
        // authentication ------------------------------------------------------
        const authHeader = this.getAuthorizationHeader();
        if (authHeader) {
            requestOptions.headers = Object.assign(Object.assign({}, requestOptions.headers), { Authorization: authHeader });
        }
        const options = {
            graph: fhirOptions.graph !== false,
            flat: !!fhirOptions.flat,
            pageLimit: (_a = fhirOptions.pageLimit, (_a !== null && _a !== void 0 ? _a : 1)),
            resolveReferences: (fhirOptions.resolveReferences || []),
            useRefreshToken: fhirOptions.useRefreshToken !== false,
            onPage: typeof fhirOptions.onPage == "function" ?
                fhirOptions.onPage :
                undefined
        };
        debugRequest("%s, options: %O, fhirOptions: %O", url, requestOptions, options);
        return lib_1.request(url, requestOptions)
            // Automatic re-auth via refresh token -----------------------------
            .catch((error) => {
            debugRequest("%o", error);
            if (error.status == 401 && options.useRefreshToken) {
                const hasRefreshToken = lib_1.getPath(this, "state.tokenResponse.refresh_token");
                if (hasRefreshToken) {
                    return this.refresh().then(() => this.request(Object.assign(Object.assign({}, requestOptions), { url }), options, _resolvedRefs));
                }
            }
            throw error;
        })
            // Handle 401 ------------------------------------------------------
            .catch(async (error) => {
            if (error.status == 401) {
                // !accessToken -> not authorized -> No session. Need to launch.
                if (!lib_1.getPath(this, "state.tokenResponse.access_token")) {
                    throw new Error("This app cannot be accessed directly. Please launch it as SMART app!");
                }
                // auto-refresh not enabled and Session expired.
                // Need to re-launch. Clear state to start over!
                if (!options.useRefreshToken) {
                    debugRequest("Your session has expired and the useRefreshToken option is set to false. Please re-launch the app.");
                    await this._clearState();
                    throw new Error(strings_1.default.expired);
                }
                // otherwise -> auto-refresh failed. Session expired.
                // Need to re-launch. Clear state to start over!
                debugRequest("Auto-refresh failed! Please re-launch the app.");
                await this._clearState();
                throw new Error(strings_1.default.expired);
            }
            throw error;
        })
            // Handle 403 ------------------------------------------------------
            .catch((error) => {
            if (error.status == 403) {
                debugRequest("Permission denied! Please make sure that you have requested the proper scopes.");
            }
            throw error;
        })
            // Handle raw requests (anything other than json) ------------------
            .then(data => {
            if (!data)
                return data;
            if (typeof data == "string")
                return data;
            if (typeof data == "object" && data instanceof Response)
                return data;
            // Resolve References ------------------------------------------
            return (async (_data) => {
                if (_data) {
                    if (_data.resourceType == "Bundle") {
                        await Promise.all((_data.entry || []).map(item => resolveRefs(item.resource, options, _resolvedRefs, this)));
                    }
                    else {
                        await resolveRefs(_data, options, _resolvedRefs, this);
                    }
                }
                return _data;
            })(data)
                // Pagination ----------------------------------------------
                .then(async (_data) => {
                if (_data && _data.resourceType == "Bundle") {
                    const links = (_data.link || []);
                    if (options.flat) {
                        _data = (_data.entry || []).map((entry) => entry.resource);
                    }
                    if (options.onPage) {
                        await options.onPage(_data, Object.assign({}, _resolvedRefs));
                    }
                    if (--options.pageLimit) {
                        const next = links.find(l => l.relation == "next");
                        _data = lib_1.makeArray(_data);
                        if (next && next.url) {
                            const nextPage = await this.request(next.url, options, _resolvedRefs);
                            if (options.onPage) {
                                return null;
                            }
                            if (options.resolveReferences.length) {
                                Object.assign(_resolvedRefs, nextPage.references);
                                return _data.concat(lib_1.makeArray(nextPage.data || nextPage));
                            }
                            return _data.concat(lib_1.makeArray(nextPage));
                        }
                    }
                }
                return _data;
            })
                // Finalize ------------------------------------------------
                .then(_data => {
                if (options.graph) {
                    _resolvedRefs = {};
                }
                else if (!options.onPage && options.resolveReferences.length) {
                    return {
                        data: _data,
                        references: _resolvedRefs
                    };
                }
                return _data;
            });
        });
    }
    /**
     * Use the refresh token to obtain new access token. If the refresh token is
     * expired (or this fails for any other reason) it will be deleted from the
     * state, so that we don't enter into loops trying to re-authorize.
     */
    refresh() {
        var _a, _b;
        const debugRefresh = lib_1.debug.extend("client:refresh");
        debugRefresh("Attempting to refresh with refresh_token...");
        const refreshToken = (_b = (_a = this.state) === null || _a === void 0 ? void 0 : _a.tokenResponse) === null || _b === void 0 ? void 0 : _b.refresh_token;
        if (!refreshToken) {
            throw new Error("Unable to refresh. No refresh_token found.");
        }
        const tokenUri = this.state.tokenUri;
        if (!tokenUri) {
            throw new Error("Unable to refresh. No tokenUri found.");
        }
        const scopes = lib_1.getPath(this, "state.tokenResponse.scope") || "";
        if (scopes.indexOf("offline_access") == -1 && scopes.indexOf("online_access") == -1) {
            throw new Error("Unable to refresh. No offline_access or online_access scope found.");
        }
        // This method is typically called internally from `request` if certain
        // request fails with 401. However, clients will often run multiple
        // requests in parallel which may result in multiple refresh calls.
        // To avoid that, we keep a to the current refresh task (if any).
        if (!this._refreshTask) {
            this._refreshTask = lib_1.request(tokenUri, {
                mode: "cors",
                method: "POST",
                headers: {
                    "content-type": "application/x-www-form-urlencoded"
                },
                body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`,
                credentials: "include"
            }).then(data => {
                if (!data.access_token) {
                    throw new Error("No access token received");
                }
                return data;
            }).then(data => {
                debugRefresh("Received new access token %O", data);
                Object.assign(this.state.tokenResponse, data);
                return this.state;
            }).catch((error) => {
                var _a, _b;
                if ((_b = (_a = this.state) === null || _a === void 0 ? void 0 : _a.tokenResponse) === null || _b === void 0 ? void 0 : _b.refresh_token) {
                    debugRefresh("Deleting the expired or invalid refresh token.");
                    delete this.state.tokenResponse.refresh_token;
                }
                throw error;
            }).finally(() => {
                this._refreshTask = null;
                const key = this.state.key;
                if (key) {
                    this.environment.getStorage().set(key, this.state);
                }
                else {
                    debugRefresh("No 'key' found in Clint.state. Cannot persist the instance.");
                }
            });
        }
        return this._refreshTask;
    }
    /**
     * Returns a promise that will be resolved with the fhir version as defined
     * in the conformance statement.
     */
    getFhirVersion() {
        return smart_1.fetchFhirVersion(this.state.serverUrl);
    }
    /**
     * Returns a promise that will be resolved with the numeric fhir version
     * - 2 for DSTU2
     * - 3 for STU3
     * - 4 for R4
     * - 0 if the version is not known
     */
    getFhirRelease() {
        return this.getFhirVersion().then(v => { var _a; return _a = settings_1.fhirVersions[v], (_a !== null && _a !== void 0 ? _a : 0); });
    }
}
exports.default = Client;
