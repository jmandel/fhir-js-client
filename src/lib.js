/*
 * This file contains some shared functions. The are used by other modules, but
 * are defined here so that tests can import this library and test them.
 */

const HttpError = require("./HttpError");
const debug     = require("debug")("FHIR");
const { patientParams } = require("./settings");

function isBrowser() {
    return typeof window === "object";
}

/**
 * Used in fetch Promise chains to reject if the "ok" property is not true
 */
async function checkResponse(resp) {
    if (!resp.ok) {
        throw (await humanizeError(resp));
    }
    return resp;
}

/**
 * Used in fetch Promise chains to return the JSON version of the response.
 * Note that `resp.json()` will throw on empty body so we use resp.text()
 * instead.
 * @param {Response} resp
 * @returns {Promise<object|string>}
 */
function responseToJSON(resp) {
    return resp.text().then(text => text.length ? JSON.parse(text) : "");
}

/**
 * This is our built-in request function. It does a few things by default
 * (unless told otherwise):
 * - Makes CORS requests
 * - Sets accept header to "application/json"
 * - Handles errors
 * - If the response is json return the json object
 * - If the response is text return the result text
 * - Otherwise return the response object on which we call stuff like `.blob()`
 * @param {String|Request} url
 * @param {Object} options
 */
function request(url, options = {}) {
    return fetch(url, {
        mode: "cors",
        ...options,
        headers: {
            accept: "application/json",
            ...options.headers
        }
    })
        .then(checkResponse)
        .then(res => {
            const type = res.headers.get("Content-Type") + "";
            if (type.match(/\bjson\b/i)) {
                return responseToJSON(res);
            }
            if (type.match(/^text\//i)) {
                return res.text();
            }
            return res;
        });
}

const getAndCache = (() => {
    let cache = {};

    return (url, force = process.env.NODE_ENV === "test") => {
        if (force || !cache[url]) {
            cache[url] = request(url);
        }
        return cache[url];
    };
})();

async function humanizeError(resp) {
    let msg = `${resp.status} ${resp.statusText}\nURL: ${resp.url}`;

    try {
        const type = resp.headers.get("Content-Type") || "text/plain";
        if (type.match(/\bjson\b/i)) {
            const json = await resp.json();
            if (json.error) {
                msg += "\n" + json.error;
                if (json.error_description) {
                    msg += ": " + json.error_description;
                }
            }
            else {
                msg += "\n\n" + JSON.stringify(json, null, 4);
            }
        }
        if (type.match(/^text\//i)) {
            const text = await resp.text();
            if (text) {
                msg += "\n\n" + text;
            }
        }
    } catch (_) {
        // ignore
    }

    throw new HttpError(msg, resp.status, resp.statusText);
}

function stripTrailingSlash(str) {
    return String(str || "").replace(/\/+$/, "");
}

/**
 * Walks through an object (or array) and returns the value found at the
 * provided path. This function is very simple so it intentionally does not
 * support any argument polymorphism, meaning that the path can only be a
 * dot-separated string. If the path is invalid returns undefined.
 * @param {Object} obj The object (or Array) to walk through
 * @param {String} path The path (eg. "a.b.4.c")
 * @returns {*} Whatever is found in the path or undefined
 */
function getPath(obj, path = "") {
    path = path.trim();
    if (!path) {
        return obj;
    }
    return path.split(".").reduce(
        (out, key) => out ? out[key] : undefined,
        obj
    );
}

/**
 * Like getPath, but if the node is found, its value is set to @value
 * @param {Object} obj The object (or Array) to walk through
 * @param {String} path The path (eg. "a.b.4.c")
 * @param {*} value The value to set
 * @returns {Object} The modified object
 */
function setPath(obj, path, value) {
    path.trim().split(".").reduce(
        (out, key, idx, arr) => {
            if (out && idx === arr.length - 1) {
                out[key] = value;
            } else {
                return out ? out[key] : undefined;
            }
        },
        obj
    );
    return obj;
}

function makeArray(arg) {
    if (Array.isArray(arg)) {
        return arg;
    }
    return [arg];
}

function absolute(path, baseUrl) {
    if (path.match(/^http/)) return path;
    if (path.match(/^urn/)) return path;
    return baseUrl.replace(/\/+$/, "") + "/" + path.replace(/^\/+/, "");
}

/**
 * Generates random strings. By default this returns random 8 characters long
 * alphanumeric strings.
 * @param {Number} strLength The length of the output string. Defaults to 8.
 * @param {String} charSet A string containing all the possible characters.
 *     Defaults to all the upper and lower-case letters plus digits.
 */
function randomString(strLength = 8, charSet = null) {
    const result = [];

    charSet = charSet || "ABCDEFGHIJKLMNOPQRSTUVWXYZ" +
                         "abcdefghijklmnopqrstuvwxyz" +
                         "0123456789";

    const len = charSet.length;
    while (strLength--) {
        result.push(charSet.charAt(Math.floor(Math.random() * len)));
    }
    return result.join("");
}

function atob(str)
{
    if (isBrowser()) {
        return window.atob(str);
    }

    // The "global." makes Webpack understand that it doesn't have to include
    // the Buffer code in the bundle
    return global.Buffer.from(str, "base64").toString("ascii");
}

function btoa(str)
{
    if (isBrowser()) {
        return window.btoa(str);
    }

    // The "global." makes Webpack understand that it doesn't have to include
    // the Buffer code in the bundle
    return global.Buffer.from(str).toString("base64");
}

function jwtDecode(token)
{
    const payload = token.split(".")[1];
    return JSON.parse(atob(payload));
}

/**
 * Groups the observations by code. Returns a map that will look like:
 * {
 *   "55284-4": [ observation1, observation2 ],
 *   "6082-2" : [ observation3 ]
 * }
 * @param {Object|Object[]} observations Array of observations
 * @param {String} property The name of a CodeableConcept property to group by
 * @returns {Object}
 */
function byCode(observations, property)
{
    const ret = {};

    function handleCodeableConcept(concept, observation) {
        if (concept && Array.isArray(concept.coding)) {
            concept.coding.forEach(({ code }) => {
                ret[code] = ret[code] || [];
                ret[code].push(observation);
            });
        }
    }

    makeArray(observations).forEach(o => {
        if (o.resourceType === "Observation" && o[property]) {
            if (Array.isArray(o[property])) {
                o[property].forEach(concept => handleCodeableConcept(concept, o));
            } else {
                handleCodeableConcept(o[property], o);
            }
        }
    });

    return ret;
}

/**
 * First groups the observations by code using `byCode`. Then returns a function
 * that accepts codes as arguments and will return a flat array of observations
 * having that codes
 * @param {Object|Object[]} observations Array of observations
 * @param {String} property The name of a CodeableConcept property to group by
 * @returns {(codes: string[]) => object[]}
 */
function byCodes(observations, property)
{
    const bank = byCode(observations, property);
    return (...codes) => codes
        .filter(code => (code + "") in bank)
        .reduce((prev, code) => [...prev, ...bank[code + ""]], []);
}

function ensureNumerical({ value, code }) {
    if (typeof value !== "number") {
        throw new Error("Found a non-numerical unit: " + value + " " + code);
    }
}

const units = {
    cm({ code, value }) {
        ensureNumerical({ code, value });
        if (code == "cm"     ) return value;
        if (code == "m"      ) return value *   100;
        if (code == "in"     ) return value *  2.54;
        if (code == "[in_us]") return value *  2.54;
        if (code == "[in_i]" ) return value *  2.54;
        if (code == "ft"     ) return value * 30.48;
        if (code == "[ft_us]") return value * 30.48;
        throw new Error("Unrecognized length unit: " + code);
    },
    kg({ code, value }){
        ensureNumerical({ code, value });
        if(code == "kg"    ) return value;
        if(code == "g"     ) return value / 1000;
        if(code.match(/lb/)) return value / 2.20462;
        if(code.match(/oz/)) return value / 35.274;
        throw new Error("Unrecognized weight unit: " + code);
    },
    any(pq){
        ensureNumerical(pq);
        return pq.value;
    }
};

/**
 * Given a conformance statement and a resource type, returns the name of the
 * URL parameter that can be used to scope the resource type by patient ID.
 * @param {fhirclient.JsonObject} conformance
 * @param {string} resourceType
 */
function getPatientParam(conformance, resourceType)
{
    // Find what resources are supported by this server
    const resources = getPath(conformance, "rest.0.resource") || [];

    // Check if this resource is supported
    const meta = resources.find(r => r.type === resourceType);
    if (!meta)
        throw new Error("Resource not supported");

    // Check if any search parameters are available for this resource
    if (!Array.isArray(meta.searchParam))
        throw new Error(`No search parameters supported for "${resourceType}" on this FHIR server`);

    // This is a rare case vut could happen in generic workflows
    if (resourceType == "Patient" && meta.searchParam.find(x => x.name == "_id"))
        return "_id";

    // Now find the first possible parameter name
    let out = patientParams.find(p => meta.searchParam.find(x => x.name == p));

    // If there is no match
    if (!out)
        throw new Error("I don't know what param to use for " + resourceType);

    return out;
}


module.exports = {
    stripTrailingSlash,
    absolute,
    getPath,
    setPath,
    makeArray,
    randomString,
    isBrowser,
    debug,
    checkResponse,
    responseToJSON,
    humanizeError,
    jwtDecode,
    request,
    atob,
    btoa,
    byCode,
    byCodes,
    units,
    getPatientParam,
    getAndCache
};
