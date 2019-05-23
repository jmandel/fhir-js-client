function urlParam(p, forceArray) {
    var query  = location.search.substr(1);
    var data   = query.split("&");
    var result = [];

    for (var i = 0; i < data.length; i++) {
        var item = data[i].split("=");
        if (item[0] === p) {
            var res = item[1].replace(/\+/g, '%20');
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
    if (!url || url == ".") {
        url = "";
    }
    if (url === "/") {
        return location.protocol + "//" + location.host + "/";
    }
    return (location.protocol + "//" + location.host + location.pathname)
        .match(/(.*\/)[^\/]*/)[1] + url;
}

module.exports = {
    urlParam,
    stripTrailingSlash,
    relative
};
