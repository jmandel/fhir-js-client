/*
 * This file contains some shared functions. The are used by other modules, but
 * are defined here so that tests can import this library and test them.
 */

function urlParam(p, forceArray) {
    const query  = location.search.substr(1);
    const data   = query.split("&");
    const result = [];

    for (let i = 0; i < data.length; i++) {
        const item = data[i].split("=");
        if (item[0] === p) {
            const res = item[1].replace(/\+/g, "%20");
            result.push(decodeURIComponent(res));
        }
    }

    if (forceArray) {
        return result;
    }

    if (result.length === 0) {
        return null;
    }

    return result[0];
}

function stripTrailingSlash(str) {
    return String(str || "").replace(/\/+$/, "");
}

function relative(url) {
    const { protocol, host, pathname } = location;
    if (!url || url == ".") {
        url = "";
    }
    if (url === "/") {
        return protocol + "//" + host + "/";
    }
    return (protocol + "//" + host + pathname).match(/(.*\/)[^/]*/)[1] + url;
}

function readyArgs() {

    let input = null;
    let callback = function() {};
    let errback = function() {};

    // ready()
    if (arguments.length === 0) {
        throw new Error("Can't call 'ready' without arguments");
    }
    
    // ready(callback)
    else if (arguments.length === 1) {
        callback = arguments[0];
    }
    
    else if (arguments.length === 2) {

        // ready(callback, errback)
        if (typeof arguments[0] === "function") {
            callback = arguments[0];
            errback  = arguments[1];
        }

        // ready(input, callback)
        else if (typeof arguments[0] === "object"){
            input    = arguments[0];
            callback = arguments[1];
        }
        
        // ready(noFunctionOrObject, whatever)
        else {
            throw new Error("ready called with invalid arguments");
        }
    }
    
    // ready(input, callback, errback)
    else if (arguments.length === 3){
        input    = arguments[0];
        callback = arguments[1];
        errback  = arguments[2];
    }
    
    // ready(...more than 3 args)
    else {
        throw new Error("ready called with invalid arguments");
    }

    return { input, callback, errback };
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

module.exports = {
    urlParam,
    stripTrailingSlash,
    relative,
    readyArgs,
    absolute,
    getPath,
    setPath,
    makeArray
};
