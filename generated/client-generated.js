(function(e){if("function"==typeof bootstrap)bootstrap("fhirclient",e);else if("object"==typeof exports)module.exports=e();else if("function"==typeof define&&define.amd)define(e);else if("undefined"!=typeof ses){if(!ses.ok())return;ses.makeFhirClient=e}else"undefined"!=typeof window?window.FhirClient=e():global.FhirClient=e()})(function(){var define,ses,bootstrap,module,exports;
return (function(e,t,n){function i(n,s){if(!t[n]){if(!e[n]){var o=typeof require=="function"&&require;if(!s&&o)return o(n,!0);if(r)return r(n,!0);throw new Error("Cannot find module '"+n+"'")}var u=t[n]={exports:{}};e[n][0].call(u.exports,function(t){var r=e[n][1][t];return i(r?r:t)},u,u.exports)}return t[n].exports}var r=typeof require=="function"&&require;for(var s=0;s<n.length;s++)i(n[s]);return i})({1:[function(require,module,exports){

},{}],2:[function(require,module,exports){
var btoa = require('btoa');
var $ = jQuery = require('jquery');
var parse = require('./parse');

module.exports = FhirClient;

function Search(p) {

  var search = this;

  search.client = p.client;
  search.resource = p.resource;
  search.searchTerms = p.searchTerms;
  search.count = p.count || 50;

  var nextPageUrl = null;

  function gotFeed(d){
    return function(data, status) {

      if(data.links) {
        var next = data.links.filter(function(l){
          return l.rel === "next";
        });
        if (next.length === 1) {
          nextPageUrl = next[0].href 
        } else {
          nextPageUrl = null; 
        }
      }

      var results = search.client.indexFeed(data); 
      d.resolve(results, search);
    }
  };

  function failedFeed(d){
    return function(failure){
      d.reject("Search failed.", arguments);
    }
  };

  search.next = function() {

    if (nextPageUrl === null) {
      throw "Next page of search not available!";
    }

    var searchParams = {
      type: 'GET',
      url: nextPageUrl,
      dataType: 'json'
    };

    var ret = new $.Deferred();

    $.ajax(search.client.authenticated(searchParams))
    .done(gotFeed(ret))
    .fail(failedFeed(ret));

    return ret;
  };

  search.execute = function() {

    var terms = search.searchTerms || {};
    terms._count = search.count;

    var searchParams = {
      type: 'GET',
      url: search.client.server.serviceUrl + '/' + search.resource + '/search',
      data: terms,
      dataType: "json",
      async: true
    };

    var ret = new $.Deferred();

    $.ajax(search.client.authenticated(searchParams))
    .done(gotFeed(ret))
    .fail(failedFeed(ret));

    return ret;
  };

}

function absolute(id, server) {
  if (id.match(/^http/)) return id;
  if (id.match(/^urn/)) return id;
  return server.serviceUrl + '/' + id;
}

var regexpSpecialChars = /([\[\]\^\$\|\(\)\\\+\*\?\{\}\=\!])/gi;

function relative(id, server) {
  if (!id.match(/^http/)) {
    id = server.serviceUrl + '/' + id
  }
  var quotedBase = ( server.serviceUrl + '/' ).replace(regexpSpecialChars, '\\$1');
  var matcher = new RegExp("^"+quotedBase + "([^/]+)/@([^/]+)(?:/history/@(.*))?$");
  var match = id.match(matcher);
  if (match === null) {
    throw "Couldn't determine a relative URI for " + id;
  }

  var params = {
    resource: match[1],
    id: match[2],
    version: match[3]
  };

  return params;
}

function FhirClient(p) {
  // p.serviceUrl
  // p.auth {
  //    type: 'none' | 'basic' | 'bearer'
  //    basic --> username, password
  //    bearer --> token
  // }

    var resources = {};
    var client = {};

    var server = client.server = {
      serviceUrl: p.serviceUrl,
      auth: p.auth
    }

    server.auth = server.auth ||  {
      type: 'none'
    };

    if (!client.server.serviceUrl || !client.server.serviceUrl.match(/https?:\/\/.+[^\/]$/)) {
      throw "Must supply a `server` propery whose `serviceUrl` begins with http(s) " + 
        "and does NOT include a trailing slash. E.g. `https://fhir.aws.af.cm/fhir`";
    }

    client.indexResource = function(id, r) {
      var parsed = parse(r);
      var ret = [parsed];
      resources[absolute(id, server)] = parsed;
      return ret;
    };

    client.indexFeed = function(atomResult) {
      var ret = [];
      atomResult.entries.forEach(function(e){
        var more = client.indexResource(e.id, e.content);
        [].push.apply(ret, more);
      });
      console.log("Index: " + Object.keys(resources));
      return ret; 
    };

    client.authenticated = function(p) {
      if (server.auth.type === 'none') {
        return p;
      }

      var h;
      if (server.auth.type === 'basic') {
        h = "Basic " + btoa(server.auth.username + ":" + server.auth.password);
      } else if (server.auth.type === 'bearer') {
        h = "Bearer " + server.auth.token;
      }
      if (!p.headers) {p.headers = {};}
      p.headers['Authorization'] = h
      //p.beforeSend = function (xhr) { xhr.setRequestHeader ("Authorization", h); }

      return p;
    };

    function handleReference(p){
      return function(from, to) {

        // Resolve any of the following:
        // 1. contained resource
        // 2. already-fetched resource
        // 3. not-yet-fetched resource

        if (to.reference === undefined) {
          throw "Can't follow a non-reference: " + to;
        }

        if (to.reference.match(/^#/)) {
          return p.contained(from, to.reference.slice(1));
        } 

        var url = absolute(to.reference, server);
        if (url in resources) {
          return p.local(url);
        }

        if (!p.remote) {
          throw "Can't look up unfetched resource " + url;
        }

        return p.remote(url);
      }
    };

    client.lookup = handleReference({
      contained: getContained,
      local: getLocal,
    });

    client.follow = handleReference({
      contained: followContained,
      local: followLocal,
      remote: followRemote
    });

    function getContained(from, id) {
      var matches = from.contained.filter(function(c){
        return c._id === id; 
      });
      if (matches.length !== 1)  {
        return null;
      }
      return matches[0];
    }

    function getLocal(url) {
      return resources[url];
    }

    function followContained(from, id) {
      var ret = new $.Deferred();
      var val = getContained(from, id);
      setTimeout(function(){
        if (val === null) {
          return ret.reject("No contained resource matches #"+id);
        }
        return ret.resolve(val);
      }, 0);
      return ret;
    };

    function followLocal(url) {
      var ret = new $.Deferred();
      var val = getLocal(url);
      setTimeout(function(){
        if (val === null) {
          return ret.reject("No local resource matches #"+id);
        }
        return ret.resolve(val);
      }, 0);
      return ret;
    };

    function followRemote(url) {
      var getParams = relative(url, server);
      return client.get(getParams);
    };

    client.get = function(p) {
      // p.resource, p.id, ?p.version, p.include

      var ret = new $.Deferred();
      var url = server.serviceUrl + '/' + p.resource + '/@' + p.id;

      $.ajax(client.authenticated({
        type: 'GET',
        url: url,
        dataType: 'json'
      }))
      .done(function(data, status){
        var ids = client.indexResource(url, data);
        if (ids.length !== 1) {
          ret.reject("Didn't get exactly one result for " + url);
        }
        ret.resolve(ids[0]);
      })
      .fail(function(){
        ret.reject("Could not fetch " + rel, arguments);
      });
      return ret;
    };

    client.search = function(p){
      // p.resource, p.count, p.searchTerms
      var s = new Search({
        client: client,
        resource: p.resource,
        searchTerms: p.searchTerms,
        count: p.count
      });

      return s.execute();
    }

    return client;
}

},{"jquery":1,"./parse":3,"btoa":4}],5:[function(require,module,exports){
require=(function(e,t,n,r){function i(r){if(!n[r]){if(!t[r]){if(e)return e(r);throw new Error("Cannot find module '"+r+"'")}var s=n[r]={exports:{}};t[r][0](function(e){var n=t[r][1][e];return i(n?n:e)},s,s.exports)}return n[r].exports}for(var s=0;s<r.length;s++)i(r[s]);return i})(typeof require!=="undefined"&&require,{1:[function(require,module,exports){
exports.readIEEE754 = function(buffer, offset, isBE, mLen, nBytes) {
  var e, m,
      eLen = nBytes * 8 - mLen - 1,
      eMax = (1 << eLen) - 1,
      eBias = eMax >> 1,
      nBits = -7,
      i = isBE ? 0 : (nBytes - 1),
      d = isBE ? 1 : -1,
      s = buffer[offset + i];

  i += d;

  e = s & ((1 << (-nBits)) - 1);
  s >>= (-nBits);
  nBits += eLen;
  for (; nBits > 0; e = e * 256 + buffer[offset + i], i += d, nBits -= 8);

  m = e & ((1 << (-nBits)) - 1);
  e >>= (-nBits);
  nBits += mLen;
  for (; nBits > 0; m = m * 256 + buffer[offset + i], i += d, nBits -= 8);

  if (e === 0) {
    e = 1 - eBias;
  } else if (e === eMax) {
    return m ? NaN : ((s ? -1 : 1) * Infinity);
  } else {
    m = m + Math.pow(2, mLen);
    e = e - eBias;
  }
  return (s ? -1 : 1) * m * Math.pow(2, e - mLen);
};

exports.writeIEEE754 = function(buffer, value, offset, isBE, mLen, nBytes) {
  var e, m, c,
      eLen = nBytes * 8 - mLen - 1,
      eMax = (1 << eLen) - 1,
      eBias = eMax >> 1,
      rt = (mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0),
      i = isBE ? (nBytes - 1) : 0,
      d = isBE ? -1 : 1,
      s = value < 0 || (value === 0 && 1 / value < 0) ? 1 : 0;

  value = Math.abs(value);

  if (isNaN(value) || value === Infinity) {
    m = isNaN(value) ? 1 : 0;
    e = eMax;
  } else {
    e = Math.floor(Math.log(value) / Math.LN2);
    if (value * (c = Math.pow(2, -e)) < 1) {
      e--;
      c *= 2;
    }
    if (e + eBias >= 1) {
      value += rt / c;
    } else {
      value += rt * Math.pow(2, 1 - eBias);
    }
    if (value * c >= 2) {
      e++;
      c /= 2;
    }

    if (e + eBias >= eMax) {
      m = 0;
      e = eMax;
    } else if (e + eBias >= 1) {
      m = (value * c - 1) * Math.pow(2, mLen);
      e = e + eBias;
    } else {
      m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen);
      e = 0;
    }
  }

  for (; mLen >= 8; buffer[offset + i] = m & 0xff, i += d, m /= 256, mLen -= 8);

  e = (e << mLen) | m;
  eLen += mLen;
  for (; eLen > 0; buffer[offset + i] = e & 0xff, i += d, e /= 256, eLen -= 8);

  buffer[offset + i - d] |= s * 128;
};

},{}],2:[function(require,module,exports){
(function(){// UTILITY
var util = require('util');
var Buffer = require("buffer").Buffer;
var pSlice = Array.prototype.slice;

function objectKeys(object) {
  if (Object.keys) return Object.keys(object);
  var result = [];
  for (var name in object) {
    if (Object.prototype.hasOwnProperty.call(object, name)) {
      result.push(name);
    }
  }
  return result;
}

// 1. The assert module provides functions that throw
// AssertionError's when particular conditions are not met. The
// assert module must conform to the following interface.

var assert = module.exports = ok;

// 2. The AssertionError is defined in assert.
// new assert.AssertionError({ message: message,
//                             actual: actual,
//                             expected: expected })

assert.AssertionError = function AssertionError(options) {
  this.name = 'AssertionError';
  this.message = options.message;
  this.actual = options.actual;
  this.expected = options.expected;
  this.operator = options.operator;
  var stackStartFunction = options.stackStartFunction || fail;

  if (Error.captureStackTrace) {
    Error.captureStackTrace(this, stackStartFunction);
  }
};
util.inherits(assert.AssertionError, Error);

function replacer(key, value) {
  if (value === undefined) {
    return '' + value;
  }
  if (typeof value === 'number' && (isNaN(value) || !isFinite(value))) {
    return value.toString();
  }
  if (typeof value === 'function' || value instanceof RegExp) {
    return value.toString();
  }
  return value;
}

function truncate(s, n) {
  if (typeof s == 'string') {
    return s.length < n ? s : s.slice(0, n);
  } else {
    return s;
  }
}

assert.AssertionError.prototype.toString = function() {
  if (this.message) {
    return [this.name + ':', this.message].join(' ');
  } else {
    return [
      this.name + ':',
      truncate(JSON.stringify(this.actual, replacer), 128),
      this.operator,
      truncate(JSON.stringify(this.expected, replacer), 128)
    ].join(' ');
  }
};

// assert.AssertionError instanceof Error

assert.AssertionError.__proto__ = Error.prototype;

// At present only the three keys mentioned above are used and
// understood by the spec. Implementations or sub modules can pass
// other keys to the AssertionError's constructor - they will be
// ignored.

// 3. All of the following functions must throw an AssertionError
// when a corresponding condition is not met, with a message that
// may be undefined if not provided.  All assertion methods provide
// both the actual and expected values to the assertion error for
// display purposes.

function fail(actual, expected, message, operator, stackStartFunction) {
  throw new assert.AssertionError({
    message: message,
    actual: actual,
    expected: expected,
    operator: operator,
    stackStartFunction: stackStartFunction
  });
}

// EXTENSION! allows for well behaved errors defined elsewhere.
assert.fail = fail;

// 4. Pure assertion tests whether a value is truthy, as determined
// by !!guard.
// assert.ok(guard, message_opt);
// This statement is equivalent to assert.equal(true, guard,
// message_opt);. To test strictly for the value true, use
// assert.strictEqual(true, guard, message_opt);.

function ok(value, message) {
  if (!!!value) fail(value, true, message, '==', assert.ok);
}
assert.ok = ok;

// 5. The equality assertion tests shallow, coercive equality with
// ==.
// assert.equal(actual, expected, message_opt);

assert.equal = function equal(actual, expected, message) {
  if (actual != expected) fail(actual, expected, message, '==', assert.equal);
};

// 6. The non-equality assertion tests for whether two objects are not equal
// with != assert.notEqual(actual, expected, message_opt);

assert.notEqual = function notEqual(actual, expected, message) {
  if (actual == expected) {
    fail(actual, expected, message, '!=', assert.notEqual);
  }
};

// 7. The equivalence assertion tests a deep equality relation.
// assert.deepEqual(actual, expected, message_opt);

assert.deepEqual = function deepEqual(actual, expected, message) {
  if (!_deepEqual(actual, expected)) {
    fail(actual, expected, message, 'deepEqual', assert.deepEqual);
  }
};

function _deepEqual(actual, expected) {
  // 7.1. All identical values are equivalent, as determined by ===.
  if (actual === expected) {
    return true;

  } else if (Buffer.isBuffer(actual) && Buffer.isBuffer(expected)) {
    if (actual.length != expected.length) return false;

    for (var i = 0; i < actual.length; i++) {
      if (actual[i] !== expected[i]) return false;
    }

    return true;

  // 7.2. If the expected value is a Date object, the actual value is
  // equivalent if it is also a Date object that refers to the same time.
  } else if (actual instanceof Date && expected instanceof Date) {
    return actual.getTime() === expected.getTime();

  // 7.3. Other pairs that do not both pass typeof value == 'object',
  // equivalence is determined by ==.
  } else if (typeof actual != 'object' && typeof expected != 'object') {
    return actual == expected;

  // 7.4. For all other Object pairs, including Array objects, equivalence is
  // determined by having the same number of owned properties (as verified
  // with Object.prototype.hasOwnProperty.call), the same set of keys
  // (although not necessarily the same order), equivalent values for every
  // corresponding key, and an identical 'prototype' property. Note: this
  // accounts for both named and indexed properties on Arrays.
  } else {
    return objEquiv(actual, expected);
  }
}

function isUndefinedOrNull(value) {
  return value === null || value === undefined;
}

function isArguments(object) {
  return Object.prototype.toString.call(object) == '[object Arguments]';
}

function objEquiv(a, b) {
  if (isUndefinedOrNull(a) || isUndefinedOrNull(b))
    return false;
  // an identical 'prototype' property.
  if (a.prototype !== b.prototype) return false;
  //~~~I've managed to break Object.keys through screwy arguments passing.
  //   Converting to array solves the problem.
  if (isArguments(a)) {
    if (!isArguments(b)) {
      return false;
    }
    a = pSlice.call(a);
    b = pSlice.call(b);
    return _deepEqual(a, b);
  }
  try {
    var ka = objectKeys(a),
        kb = objectKeys(b),
        key, i;
  } catch (e) {//happens when one is a string literal and the other isn't
    return false;
  }
  // having the same number of owned properties (keys incorporates
  // hasOwnProperty)
  if (ka.length != kb.length)
    return false;
  //the same set of keys (although not necessarily the same order),
  ka.sort();
  kb.sort();
  //~~~cheap key test
  for (i = ka.length - 1; i >= 0; i--) {
    if (ka[i] != kb[i])
      return false;
  }
  //equivalent values for every corresponding key, and
  //~~~possibly expensive deep test
  for (i = ka.length - 1; i >= 0; i--) {
    key = ka[i];
    if (!_deepEqual(a[key], b[key])) return false;
  }
  return true;
}

// 8. The non-equivalence assertion tests for any deep inequality.
// assert.notDeepEqual(actual, expected, message_opt);

assert.notDeepEqual = function notDeepEqual(actual, expected, message) {
  if (_deepEqual(actual, expected)) {
    fail(actual, expected, message, 'notDeepEqual', assert.notDeepEqual);
  }
};

// 9. The strict equality assertion tests strict equality, as determined by ===.
// assert.strictEqual(actual, expected, message_opt);

assert.strictEqual = function strictEqual(actual, expected, message) {
  if (actual !== expected) {
    fail(actual, expected, message, '===', assert.strictEqual);
  }
};

// 10. The strict non-equality assertion tests for strict inequality, as
// determined by !==.  assert.notStrictEqual(actual, expected, message_opt);

assert.notStrictEqual = function notStrictEqual(actual, expected, message) {
  if (actual === expected) {
    fail(actual, expected, message, '!==', assert.notStrictEqual);
  }
};

function expectedException(actual, expected) {
  if (!actual || !expected) {
    return false;
  }

  if (expected instanceof RegExp) {
    return expected.test(actual);
  } else if (actual instanceof expected) {
    return true;
  } else if (expected.call({}, actual) === true) {
    return true;
  }

  return false;
}

function _throws(shouldThrow, block, expected, message) {
  var actual;

  if (typeof expected === 'string') {
    message = expected;
    expected = null;
  }

  try {
    block();
  } catch (e) {
    actual = e;
  }

  message = (expected && expected.name ? ' (' + expected.name + ').' : '.') +
            (message ? ' ' + message : '.');

  if (shouldThrow && !actual) {
    fail('Missing expected exception' + message);
  }

  if (!shouldThrow && expectedException(actual, expected)) {
    fail('Got unwanted exception' + message);
  }

  if ((shouldThrow && actual && expected &&
      !expectedException(actual, expected)) || (!shouldThrow && actual)) {
    throw actual;
  }
}

// 11. Expected to throw an error:
// assert.throws(block, Error_opt, message_opt);

assert.throws = function(block, /*optional*/error, /*optional*/message) {
  _throws.apply(this, [true].concat(pSlice.call(arguments)));
};

// EXTENSION! This is annoying to write outside this module.
assert.doesNotThrow = function(block, /*optional*/error, /*optional*/message) {
  _throws.apply(this, [false].concat(pSlice.call(arguments)));
};

assert.ifError = function(err) { if (err) {throw err;}};

})()
},{"util":3,"buffer":4}],"buffer-browserify":[function(require,module,exports){
module.exports=require('q9TxCC');
},{}],"q9TxCC":[function(require,module,exports){
(function(){function SlowBuffer (size) {
    this.length = size;
};

var assert = require('assert');

exports.INSPECT_MAX_BYTES = 50;


function toHex(n) {
  if (n < 16) return '0' + n.toString(16);
  return n.toString(16);
}

function utf8ToBytes(str) {
  var byteArray = [];
  for (var i = 0; i < str.length; i++)
    if (str.charCodeAt(i) <= 0x7F)
      byteArray.push(str.charCodeAt(i));
    else {
      var h = encodeURIComponent(str.charAt(i)).substr(1).split('%');
      for (var j = 0; j < h.length; j++)
        byteArray.push(parseInt(h[j], 16));
    }

  return byteArray;
}

function asciiToBytes(str) {
  var byteArray = []
  for (var i = 0; i < str.length; i++ )
    // Node's code seems to be doing this and not & 0x7F..
    byteArray.push( str.charCodeAt(i) & 0xFF );

  return byteArray;
}

function base64ToBytes(str) {
  return require("base64-js").toByteArray(str);
}

SlowBuffer.byteLength = function (str, encoding) {
  switch (encoding || "utf8") {
    case 'hex':
      return str.length / 2;

    case 'utf8':
    case 'utf-8':
      return utf8ToBytes(str).length;

    case 'ascii':
    case 'binary':
      return str.length;

    case 'base64':
      return base64ToBytes(str).length;

    default:
      throw new Error('Unknown encoding');
  }
};

function blitBuffer(src, dst, offset, length) {
  var pos, i = 0;
  while (i < length) {
    if ((i+offset >= dst.length) || (i >= src.length))
      break;

    dst[i + offset] = src[i];
    i++;
  }
  return i;
}

SlowBuffer.prototype.utf8Write = function (string, offset, length) {
  var bytes, pos;
  return SlowBuffer._charsWritten =  blitBuffer(utf8ToBytes(string), this, offset, length);
};

SlowBuffer.prototype.asciiWrite = function (string, offset, length) {
  var bytes, pos;
  return SlowBuffer._charsWritten =  blitBuffer(asciiToBytes(string), this, offset, length);
};

SlowBuffer.prototype.binaryWrite = SlowBuffer.prototype.asciiWrite;

SlowBuffer.prototype.base64Write = function (string, offset, length) {
  var bytes, pos;
  return SlowBuffer._charsWritten = blitBuffer(base64ToBytes(string), this, offset, length);
};

SlowBuffer.prototype.base64Slice = function (start, end) {
  var bytes = Array.prototype.slice.apply(this, arguments)
  return require("base64-js").fromByteArray(bytes);
}

function decodeUtf8Char(str) {
  try {
    return decodeURIComponent(str);
  } catch (err) {
    return String.fromCharCode(0xFFFD); // UTF 8 invalid char
  }
}

SlowBuffer.prototype.utf8Slice = function () {
  var bytes = Array.prototype.slice.apply(this, arguments);
  var res = "";
  var tmp = "";
  var i = 0;
  while (i < bytes.length) {
    if (bytes[i] <= 0x7F) {
      res += decodeUtf8Char(tmp) + String.fromCharCode(bytes[i]);
      tmp = "";
    } else
      tmp += "%" + bytes[i].toString(16);

    i++;
  }

  return res + decodeUtf8Char(tmp);
}

SlowBuffer.prototype.asciiSlice = function () {
  var bytes = Array.prototype.slice.apply(this, arguments);
  var ret = "";
  for (var i = 0; i < bytes.length; i++)
    ret += String.fromCharCode(bytes[i]);
  return ret;
}

SlowBuffer.prototype.binarySlice = SlowBuffer.prototype.asciiSlice;

SlowBuffer.prototype.inspect = function() {
  var out = [],
      len = this.length;
  for (var i = 0; i < len; i++) {
    out[i] = toHex(this[i]);
    if (i == exports.INSPECT_MAX_BYTES) {
      out[i + 1] = '...';
      break;
    }
  }
  return '<SlowBuffer ' + out.join(' ') + '>';
};


SlowBuffer.prototype.hexSlice = function(start, end) {
  var len = this.length;

  if (!start || start < 0) start = 0;
  if (!end || end < 0 || end > len) end = len;

  var out = '';
  for (var i = start; i < end; i++) {
    out += toHex(this[i]);
  }
  return out;
};


SlowBuffer.prototype.toString = function(encoding, start, end) {
  encoding = String(encoding || 'utf8').toLowerCase();
  start = +start || 0;
  if (typeof end == 'undefined') end = this.length;

  // Fastpath empty strings
  if (+end == start) {
    return '';
  }

  switch (encoding) {
    case 'hex':
      return this.hexSlice(start, end);

    case 'utf8':
    case 'utf-8':
      return this.utf8Slice(start, end);

    case 'ascii':
      return this.asciiSlice(start, end);

    case 'binary':
      return this.binarySlice(start, end);

    case 'base64':
      return this.base64Slice(start, end);

    case 'ucs2':
    case 'ucs-2':
      return this.ucs2Slice(start, end);

    default:
      throw new Error('Unknown encoding');
  }
};


SlowBuffer.prototype.hexWrite = function(string, offset, length) {
  offset = +offset || 0;
  var remaining = this.length - offset;
  if (!length) {
    length = remaining;
  } else {
    length = +length;
    if (length > remaining) {
      length = remaining;
    }
  }

  // must be an even number of digits
  var strLen = string.length;
  if (strLen % 2) {
    throw new Error('Invalid hex string');
  }
  if (length > strLen / 2) {
    length = strLen / 2;
  }
  for (var i = 0; i < length; i++) {
    var byte = parseInt(string.substr(i * 2, 2), 16);
    if (isNaN(byte)) throw new Error('Invalid hex string');
    this[offset + i] = byte;
  }
  SlowBuffer._charsWritten = i * 2;
  return i;
};


SlowBuffer.prototype.write = function(string, offset, length, encoding) {
  // Support both (string, offset, length, encoding)
  // and the legacy (string, encoding, offset, length)
  if (isFinite(offset)) {
    if (!isFinite(length)) {
      encoding = length;
      length = undefined;
    }
  } else {  // legacy
    var swap = encoding;
    encoding = offset;
    offset = length;
    length = swap;
  }

  offset = +offset || 0;
  var remaining = this.length - offset;
  if (!length) {
    length = remaining;
  } else {
    length = +length;
    if (length > remaining) {
      length = remaining;
    }
  }
  encoding = String(encoding || 'utf8').toLowerCase();

  switch (encoding) {
    case 'hex':
      return this.hexWrite(string, offset, length);

    case 'utf8':
    case 'utf-8':
      return this.utf8Write(string, offset, length);

    case 'ascii':
      return this.asciiWrite(string, offset, length);

    case 'binary':
      return this.binaryWrite(string, offset, length);

    case 'base64':
      return this.base64Write(string, offset, length);

    case 'ucs2':
    case 'ucs-2':
      return this.ucs2Write(string, offset, length);

    default:
      throw new Error('Unknown encoding');
  }
};


// slice(start, end)
SlowBuffer.prototype.slice = function(start, end) {
  if (end === undefined) end = this.length;

  if (end > this.length) {
    throw new Error('oob');
  }
  if (start > end) {
    throw new Error('oob');
  }

  return new Buffer(this, end - start, +start);
};

SlowBuffer.prototype.copy = function(target, targetstart, sourcestart, sourceend) {
  var temp = [];
  for (var i=sourcestart; i<sourceend; i++) {
    assert.ok(typeof this[i] !== 'undefined', "copying undefined buffer bytes!");
    temp.push(this[i]);
  }

  for (var i=targetstart; i<targetstart+temp.length; i++) {
    target[i] = temp[i-targetstart];
  }
};

SlowBuffer.prototype.fill = function(value, start, end) {
  if (end > this.length) {
    throw new Error('oob');
  }
  if (start > end) {
    throw new Error('oob');
  }

  for (var i = start; i < end; i++) {
    this[i] = value;
  }
}

function coerce(length) {
  // Coerce length to a number (possibly NaN), round up
  // in case it's fractional (e.g. 123.456) then do a
  // double negate to coerce a NaN to 0. Easy, right?
  length = ~~Math.ceil(+length);
  return length < 0 ? 0 : length;
}


// Buffer

function Buffer(subject, encoding, offset) {
  if (!(this instanceof Buffer)) {
    return new Buffer(subject, encoding, offset);
  }

  var type;

  // Are we slicing?
  if (typeof offset === 'number') {
    this.length = coerce(encoding);
    this.parent = subject;
    this.offset = offset;
  } else {
    // Find the length
    switch (type = typeof subject) {
      case 'number':
        this.length = coerce(subject);
        break;

      case 'string':
        this.length = Buffer.byteLength(subject, encoding);
        break;

      case 'object': // Assume object is an array
        this.length = coerce(subject.length);
        break;

      default:
        throw new Error('First argument needs to be a number, ' +
                        'array or string.');
    }

    if (this.length > Buffer.poolSize) {
      // Big buffer, just alloc one.
      this.parent = new SlowBuffer(this.length);
      this.offset = 0;

    } else {
      // Small buffer.
      if (!pool || pool.length - pool.used < this.length) allocPool();
      this.parent = pool;
      this.offset = pool.used;
      pool.used += this.length;
    }

    // Treat array-ish objects as a byte array.
    if (isArrayIsh(subject)) {
      for (var i = 0; i < this.length; i++) {
        if (subject instanceof Buffer) {
          this.parent[i + this.offset] = subject.readUInt8(i);
        }
        else {
          this.parent[i + this.offset] = subject[i];
        }
      }
    } else if (type == 'string') {
      // We are a string
      this.length = this.write(subject, 0, encoding);
    }
  }

}

function isArrayIsh(subject) {
  return Array.isArray(subject) || Buffer.isBuffer(subject) ||
         subject && typeof subject === 'object' &&
         typeof subject.length === 'number';
}

exports.SlowBuffer = SlowBuffer;
exports.Buffer = Buffer;

Buffer.poolSize = 8 * 1024;
var pool;

function allocPool() {
  pool = new SlowBuffer(Buffer.poolSize);
  pool.used = 0;
}


// Static methods
Buffer.isBuffer = function isBuffer(b) {
  return b instanceof Buffer || b instanceof SlowBuffer;
};

Buffer.concat = function (list, totalLength) {
  if (!Array.isArray(list)) {
    throw new Error("Usage: Buffer.concat(list, [totalLength])\n \
      list should be an Array.");
  }

  if (list.length === 0) {
    return new Buffer(0);
  } else if (list.length === 1) {
    return list[0];
  }

  if (typeof totalLength !== 'number') {
    totalLength = 0;
    for (var i = 0; i < list.length; i++) {
      var buf = list[i];
      totalLength += buf.length;
    }
  }

  var buffer = new Buffer(totalLength);
  var pos = 0;
  for (var i = 0; i < list.length; i++) {
    var buf = list[i];
    buf.copy(buffer, pos);
    pos += buf.length;
  }
  return buffer;
};

// Inspect
Buffer.prototype.inspect = function inspect() {
  var out = [],
      len = this.length;

  for (var i = 0; i < len; i++) {
    out[i] = toHex(this.parent[i + this.offset]);
    if (i == exports.INSPECT_MAX_BYTES) {
      out[i + 1] = '...';
      break;
    }
  }

  return '<Buffer ' + out.join(' ') + '>';
};


Buffer.prototype.get = function get(i) {
  if (i < 0 || i >= this.length) throw new Error('oob');
  return this.parent[this.offset + i];
};


Buffer.prototype.set = function set(i, v) {
  if (i < 0 || i >= this.length) throw new Error('oob');
  return this.parent[this.offset + i] = v;
};


// write(string, offset = 0, length = buffer.length-offset, encoding = 'utf8')
Buffer.prototype.write = function(string, offset, length, encoding) {
  // Support both (string, offset, length, encoding)
  // and the legacy (string, encoding, offset, length)
  if (isFinite(offset)) {
    if (!isFinite(length)) {
      encoding = length;
      length = undefined;
    }
  } else {  // legacy
    var swap = encoding;
    encoding = offset;
    offset = length;
    length = swap;
  }

  offset = +offset || 0;
  var remaining = this.length - offset;
  if (!length) {
    length = remaining;
  } else {
    length = +length;
    if (length > remaining) {
      length = remaining;
    }
  }
  encoding = String(encoding || 'utf8').toLowerCase();

  var ret;
  switch (encoding) {
    case 'hex':
      ret = this.parent.hexWrite(string, this.offset + offset, length);
      break;

    case 'utf8':
    case 'utf-8':
      ret = this.parent.utf8Write(string, this.offset + offset, length);
      break;

    case 'ascii':
      ret = this.parent.asciiWrite(string, this.offset + offset, length);
      break;

    case 'binary':
      ret = this.parent.binaryWrite(string, this.offset + offset, length);
      break;

    case 'base64':
      // Warning: maxLength not taken into account in base64Write
      ret = this.parent.base64Write(string, this.offset + offset, length);
      break;

    case 'ucs2':
    case 'ucs-2':
      ret = this.parent.ucs2Write(string, this.offset + offset, length);
      break;

    default:
      throw new Error('Unknown encoding');
  }

  Buffer._charsWritten = SlowBuffer._charsWritten;

  return ret;
};


// toString(encoding, start=0, end=buffer.length)
Buffer.prototype.toString = function(encoding, start, end) {
  encoding = String(encoding || 'utf8').toLowerCase();

  if (typeof start == 'undefined' || start < 0) {
    start = 0;
  } else if (start > this.length) {
    start = this.length;
  }

  if (typeof end == 'undefined' || end > this.length) {
    end = this.length;
  } else if (end < 0) {
    end = 0;
  }

  start = start + this.offset;
  end = end + this.offset;

  switch (encoding) {
    case 'hex':
      return this.parent.hexSlice(start, end);

    case 'utf8':
    case 'utf-8':
      return this.parent.utf8Slice(start, end);

    case 'ascii':
      return this.parent.asciiSlice(start, end);

    case 'binary':
      return this.parent.binarySlice(start, end);

    case 'base64':
      return this.parent.base64Slice(start, end);

    case 'ucs2':
    case 'ucs-2':
      return this.parent.ucs2Slice(start, end);

    default:
      throw new Error('Unknown encoding');
  }
};


// byteLength
Buffer.byteLength = SlowBuffer.byteLength;


// fill(value, start=0, end=buffer.length)
Buffer.prototype.fill = function fill(value, start, end) {
  value || (value = 0);
  start || (start = 0);
  end || (end = this.length);

  if (typeof value === 'string') {
    value = value.charCodeAt(0);
  }
  if (!(typeof value === 'number') || isNaN(value)) {
    throw new Error('value is not a number');
  }

  if (end < start) throw new Error('end < start');

  // Fill 0 bytes; we're done
  if (end === start) return 0;
  if (this.length == 0) return 0;

  if (start < 0 || start >= this.length) {
    throw new Error('start out of bounds');
  }

  if (end < 0 || end > this.length) {
    throw new Error('end out of bounds');
  }

  return this.parent.fill(value,
                          start + this.offset,
                          end + this.offset);
};


// copy(targetBuffer, targetStart=0, sourceStart=0, sourceEnd=buffer.length)
Buffer.prototype.copy = function(target, target_start, start, end) {
  var source = this;
  start || (start = 0);
  end || (end = this.length);
  target_start || (target_start = 0);

  if (end < start) throw new Error('sourceEnd < sourceStart');

  // Copy 0 bytes; we're done
  if (end === start) return 0;
  if (target.length == 0 || source.length == 0) return 0;

  if (target_start < 0 || target_start >= target.length) {
    throw new Error('targetStart out of bounds');
  }

  if (start < 0 || start >= source.length) {
    throw new Error('sourceStart out of bounds');
  }

  if (end < 0 || end > source.length) {
    throw new Error('sourceEnd out of bounds');
  }

  // Are we oob?
  if (end > this.length) {
    end = this.length;
  }

  if (target.length - target_start < end - start) {
    end = target.length - target_start + start;
  }

  return this.parent.copy(target.parent,
                          target_start + target.offset,
                          start + this.offset,
                          end + this.offset);
};


// slice(start, end)
Buffer.prototype.slice = function(start, end) {
  if (end === undefined) end = this.length;
  if (end > this.length) throw new Error('oob');
  if (start > end) throw new Error('oob');

  return new Buffer(this.parent, end - start, +start + this.offset);
};


// Legacy methods for backwards compatibility.

Buffer.prototype.utf8Slice = function(start, end) {
  return this.toString('utf8', start, end);
};

Buffer.prototype.binarySlice = function(start, end) {
  return this.toString('binary', start, end);
};

Buffer.prototype.asciiSlice = function(start, end) {
  return this.toString('ascii', start, end);
};

Buffer.prototype.utf8Write = function(string, offset) {
  return this.write(string, offset, 'utf8');
};

Buffer.prototype.binaryWrite = function(string, offset) {
  return this.write(string, offset, 'binary');
};

Buffer.prototype.asciiWrite = function(string, offset) {
  return this.write(string, offset, 'ascii');
};

Buffer.prototype.readUInt8 = function(offset, noAssert) {
  var buffer = this;

  if (!noAssert) {
    assert.ok(offset !== undefined && offset !== null,
        'missing offset');

    assert.ok(offset < buffer.length,
        'Trying to read beyond buffer length');
  }

  if (offset >= buffer.length) return;

  return buffer.parent[buffer.offset + offset];
};

function readUInt16(buffer, offset, isBigEndian, noAssert) {
  var val = 0;


  if (!noAssert) {
    assert.ok(typeof (isBigEndian) === 'boolean',
        'missing or invalid endian');

    assert.ok(offset !== undefined && offset !== null,
        'missing offset');

    assert.ok(offset + 1 < buffer.length,
        'Trying to read beyond buffer length');
  }

  if (offset >= buffer.length) return 0;

  if (isBigEndian) {
    val = buffer.parent[buffer.offset + offset] << 8;
    if (offset + 1 < buffer.length) {
      val |= buffer.parent[buffer.offset + offset + 1];
    }
  } else {
    val = buffer.parent[buffer.offset + offset];
    if (offset + 1 < buffer.length) {
      val |= buffer.parent[buffer.offset + offset + 1] << 8;
    }
  }

  return val;
}

Buffer.prototype.readUInt16LE = function(offset, noAssert) {
  return readUInt16(this, offset, false, noAssert);
};

Buffer.prototype.readUInt16BE = function(offset, noAssert) {
  return readUInt16(this, offset, true, noAssert);
};

function readUInt32(buffer, offset, isBigEndian, noAssert) {
  var val = 0;

  if (!noAssert) {
    assert.ok(typeof (isBigEndian) === 'boolean',
        'missing or invalid endian');

    assert.ok(offset !== undefined && offset !== null,
        'missing offset');

    assert.ok(offset + 3 < buffer.length,
        'Trying to read beyond buffer length');
  }

  if (offset >= buffer.length) return 0;

  if (isBigEndian) {
    if (offset + 1 < buffer.length)
      val = buffer.parent[buffer.offset + offset + 1] << 16;
    if (offset + 2 < buffer.length)
      val |= buffer.parent[buffer.offset + offset + 2] << 8;
    if (offset + 3 < buffer.length)
      val |= buffer.parent[buffer.offset + offset + 3];
    val = val + (buffer.parent[buffer.offset + offset] << 24 >>> 0);
  } else {
    if (offset + 2 < buffer.length)
      val = buffer.parent[buffer.offset + offset + 2] << 16;
    if (offset + 1 < buffer.length)
      val |= buffer.parent[buffer.offset + offset + 1] << 8;
    val |= buffer.parent[buffer.offset + offset];
    if (offset + 3 < buffer.length)
      val = val + (buffer.parent[buffer.offset + offset + 3] << 24 >>> 0);
  }

  return val;
}

Buffer.prototype.readUInt32LE = function(offset, noAssert) {
  return readUInt32(this, offset, false, noAssert);
};

Buffer.prototype.readUInt32BE = function(offset, noAssert) {
  return readUInt32(this, offset, true, noAssert);
};


/*
 * Signed integer types, yay team! A reminder on how two's complement actually
 * works. The first bit is the signed bit, i.e. tells us whether or not the
 * number should be positive or negative. If the two's complement value is
 * positive, then we're done, as it's equivalent to the unsigned representation.
 *
 * Now if the number is positive, you're pretty much done, you can just leverage
 * the unsigned translations and return those. Unfortunately, negative numbers
 * aren't quite that straightforward.
 *
 * At first glance, one might be inclined to use the traditional formula to
 * translate binary numbers between the positive and negative values in two's
 * complement. (Though it doesn't quite work for the most negative value)
 * Mainly:
 *  - invert all the bits
 *  - add one to the result
 *
 * Of course, this doesn't quite work in Javascript. Take for example the value
 * of -128. This could be represented in 16 bits (big-endian) as 0xff80. But of
 * course, Javascript will do the following:
 *
 * > ~0xff80
 * -65409
 *
 * Whoh there, Javascript, that's not quite right. But wait, according to
 * Javascript that's perfectly correct. When Javascript ends up seeing the
 * constant 0xff80, it has no notion that it is actually a signed number. It
 * assumes that we've input the unsigned value 0xff80. Thus, when it does the
 * binary negation, it casts it into a signed value, (positive 0xff80). Then
 * when you perform binary negation on that, it turns it into a negative number.
 *
 * Instead, we're going to have to use the following general formula, that works
 * in a rather Javascript friendly way. I'm glad we don't support this kind of
 * weird numbering scheme in the kernel.
 *
 * (BIT-MAX - (unsigned)val + 1) * -1
 *
 * The astute observer, may think that this doesn't make sense for 8-bit numbers
 * (really it isn't necessary for them). However, when you get 16-bit numbers,
 * you do. Let's go back to our prior example and see how this will look:
 *
 * (0xffff - 0xff80 + 1) * -1
 * (0x007f + 1) * -1
 * (0x0080) * -1
 */
Buffer.prototype.readInt8 = function(offset, noAssert) {
  var buffer = this;
  var neg;

  if (!noAssert) {
    assert.ok(offset !== undefined && offset !== null,
        'missing offset');

    assert.ok(offset < buffer.length,
        'Trying to read beyond buffer length');
  }

  if (offset >= buffer.length) return;

  neg = buffer.parent[buffer.offset + offset] & 0x80;
  if (!neg) {
    return (buffer.parent[buffer.offset + offset]);
  }

  return ((0xff - buffer.parent[buffer.offset + offset] + 1) * -1);
};

function readInt16(buffer, offset, isBigEndian, noAssert) {
  var neg, val;

  if (!noAssert) {
    assert.ok(typeof (isBigEndian) === 'boolean',
        'missing or invalid endian');

    assert.ok(offset !== undefined && offset !== null,
        'missing offset');

    assert.ok(offset + 1 < buffer.length,
        'Trying to read beyond buffer length');
  }

  val = readUInt16(buffer, offset, isBigEndian, noAssert);
  neg = val & 0x8000;
  if (!neg) {
    return val;
  }

  return (0xffff - val + 1) * -1;
}

Buffer.prototype.readInt16LE = function(offset, noAssert) {
  return readInt16(this, offset, false, noAssert);
};

Buffer.prototype.readInt16BE = function(offset, noAssert) {
  return readInt16(this, offset, true, noAssert);
};

function readInt32(buffer, offset, isBigEndian, noAssert) {
  var neg, val;

  if (!noAssert) {
    assert.ok(typeof (isBigEndian) === 'boolean',
        'missing or invalid endian');

    assert.ok(offset !== undefined && offset !== null,
        'missing offset');

    assert.ok(offset + 3 < buffer.length,
        'Trying to read beyond buffer length');
  }

  val = readUInt32(buffer, offset, isBigEndian, noAssert);
  neg = val & 0x80000000;
  if (!neg) {
    return (val);
  }

  return (0xffffffff - val + 1) * -1;
}

Buffer.prototype.readInt32LE = function(offset, noAssert) {
  return readInt32(this, offset, false, noAssert);
};

Buffer.prototype.readInt32BE = function(offset, noAssert) {
  return readInt32(this, offset, true, noAssert);
};

function readFloat(buffer, offset, isBigEndian, noAssert) {
  if (!noAssert) {
    assert.ok(typeof (isBigEndian) === 'boolean',
        'missing or invalid endian');

    assert.ok(offset + 3 < buffer.length,
        'Trying to read beyond buffer length');
  }

  return require('./buffer_ieee754').readIEEE754(buffer, offset, isBigEndian,
      23, 4);
}

Buffer.prototype.readFloatLE = function(offset, noAssert) {
  return readFloat(this, offset, false, noAssert);
};

Buffer.prototype.readFloatBE = function(offset, noAssert) {
  return readFloat(this, offset, true, noAssert);
};

function readDouble(buffer, offset, isBigEndian, noAssert) {
  if (!noAssert) {
    assert.ok(typeof (isBigEndian) === 'boolean',
        'missing or invalid endian');

    assert.ok(offset + 7 < buffer.length,
        'Trying to read beyond buffer length');
  }

  return require('./buffer_ieee754').readIEEE754(buffer, offset, isBigEndian,
      52, 8);
}

Buffer.prototype.readDoubleLE = function(offset, noAssert) {
  return readDouble(this, offset, false, noAssert);
};

Buffer.prototype.readDoubleBE = function(offset, noAssert) {
  return readDouble(this, offset, true, noAssert);
};


/*
 * We have to make sure that the value is a valid integer. This means that it is
 * non-negative. It has no fractional component and that it does not exceed the
 * maximum allowed value.
 *
 *      value           The number to check for validity
 *
 *      max             The maximum value
 */
function verifuint(value, max) {
  assert.ok(typeof (value) == 'number',
      'cannot write a non-number as a number');

  assert.ok(value >= 0,
      'specified a negative value for writing an unsigned value');

  assert.ok(value <= max, 'value is larger than maximum value for type');

  assert.ok(Math.floor(value) === value, 'value has a fractional component');
}

Buffer.prototype.writeUInt8 = function(value, offset, noAssert) {
  var buffer = this;

  if (!noAssert) {
    assert.ok(value !== undefined && value !== null,
        'missing value');

    assert.ok(offset !== undefined && offset !== null,
        'missing offset');

    assert.ok(offset < buffer.length,
        'trying to write beyond buffer length');

    verifuint(value, 0xff);
  }

  if (offset < buffer.length) {
    buffer.parent[buffer.offset + offset] = value;
  }
};

function writeUInt16(buffer, value, offset, isBigEndian, noAssert) {
  if (!noAssert) {
    assert.ok(value !== undefined && value !== null,
        'missing value');

    assert.ok(typeof (isBigEndian) === 'boolean',
        'missing or invalid endian');

    assert.ok(offset !== undefined && offset !== null,
        'missing offset');

    assert.ok(offset + 1 < buffer.length,
        'trying to write beyond buffer length');

    verifuint(value, 0xffff);
  }

  for (var i = 0; i < Math.min(buffer.length - offset, 2); i++) {
    buffer.parent[buffer.offset + offset + i] =
        (value & (0xff << (8 * (isBigEndian ? 1 - i : i)))) >>>
            (isBigEndian ? 1 - i : i) * 8;
  }

}

Buffer.prototype.writeUInt16LE = function(value, offset, noAssert) {
  writeUInt16(this, value, offset, false, noAssert);
};

Buffer.prototype.writeUInt16BE = function(value, offset, noAssert) {
  writeUInt16(this, value, offset, true, noAssert);
};

function writeUInt32(buffer, value, offset, isBigEndian, noAssert) {
  if (!noAssert) {
    assert.ok(value !== undefined && value !== null,
        'missing value');

    assert.ok(typeof (isBigEndian) === 'boolean',
        'missing or invalid endian');

    assert.ok(offset !== undefined && offset !== null,
        'missing offset');

    assert.ok(offset + 3 < buffer.length,
        'trying to write beyond buffer length');

    verifuint(value, 0xffffffff);
  }

  for (var i = 0; i < Math.min(buffer.length - offset, 4); i++) {
    buffer.parent[buffer.offset + offset + i] =
        (value >>> (isBigEndian ? 3 - i : i) * 8) & 0xff;
  }
}

Buffer.prototype.writeUInt32LE = function(value, offset, noAssert) {
  writeUInt32(this, value, offset, false, noAssert);
};

Buffer.prototype.writeUInt32BE = function(value, offset, noAssert) {
  writeUInt32(this, value, offset, true, noAssert);
};


/*
 * We now move onto our friends in the signed number category. Unlike unsigned
 * numbers, we're going to have to worry a bit more about how we put values into
 * arrays. Since we are only worrying about signed 32-bit values, we're in
 * slightly better shape. Unfortunately, we really can't do our favorite binary
 * & in this system. It really seems to do the wrong thing. For example:
 *
 * > -32 & 0xff
 * 224
 *
 * What's happening above is really: 0xe0 & 0xff = 0xe0. However, the results of
 * this aren't treated as a signed number. Ultimately a bad thing.
 *
 * What we're going to want to do is basically create the unsigned equivalent of
 * our representation and pass that off to the wuint* functions. To do that
 * we're going to do the following:
 *
 *  - if the value is positive
 *      we can pass it directly off to the equivalent wuint
 *  - if the value is negative
 *      we do the following computation:
 *         mb + val + 1, where
 *         mb   is the maximum unsigned value in that byte size
 *         val  is the Javascript negative integer
 *
 *
 * As a concrete value, take -128. In signed 16 bits this would be 0xff80. If
 * you do out the computations:
 *
 * 0xffff - 128 + 1
 * 0xffff - 127
 * 0xff80
 *
 * You can then encode this value as the signed version. This is really rather
 * hacky, but it should work and get the job done which is our goal here.
 */

/*
 * A series of checks to make sure we actually have a signed 32-bit number
 */
function verifsint(value, max, min) {
  assert.ok(typeof (value) == 'number',
      'cannot write a non-number as a number');

  assert.ok(value <= max, 'value larger than maximum allowed value');

  assert.ok(value >= min, 'value smaller than minimum allowed value');

  assert.ok(Math.floor(value) === value, 'value has a fractional component');
}

function verifIEEE754(value, max, min) {
  assert.ok(typeof (value) == 'number',
      'cannot write a non-number as a number');

  assert.ok(value <= max, 'value larger than maximum allowed value');

  assert.ok(value >= min, 'value smaller than minimum allowed value');
}

Buffer.prototype.writeInt8 = function(value, offset, noAssert) {
  var buffer = this;

  if (!noAssert) {
    assert.ok(value !== undefined && value !== null,
        'missing value');

    assert.ok(offset !== undefined && offset !== null,
        'missing offset');

    assert.ok(offset < buffer.length,
        'Trying to write beyond buffer length');

    verifsint(value, 0x7f, -0x80);
  }

  if (value >= 0) {
    buffer.writeUInt8(value, offset, noAssert);
  } else {
    buffer.writeUInt8(0xff + value + 1, offset, noAssert);
  }
};

function writeInt16(buffer, value, offset, isBigEndian, noAssert) {
  if (!noAssert) {
    assert.ok(value !== undefined && value !== null,
        'missing value');

    assert.ok(typeof (isBigEndian) === 'boolean',
        'missing or invalid endian');

    assert.ok(offset !== undefined && offset !== null,
        'missing offset');

    assert.ok(offset + 1 < buffer.length,
        'Trying to write beyond buffer length');

    verifsint(value, 0x7fff, -0x8000);
  }

  if (value >= 0) {
    writeUInt16(buffer, value, offset, isBigEndian, noAssert);
  } else {
    writeUInt16(buffer, 0xffff + value + 1, offset, isBigEndian, noAssert);
  }
}

Buffer.prototype.writeInt16LE = function(value, offset, noAssert) {
  writeInt16(this, value, offset, false, noAssert);
};

Buffer.prototype.writeInt16BE = function(value, offset, noAssert) {
  writeInt16(this, value, offset, true, noAssert);
};

function writeInt32(buffer, value, offset, isBigEndian, noAssert) {
  if (!noAssert) {
    assert.ok(value !== undefined && value !== null,
        'missing value');

    assert.ok(typeof (isBigEndian) === 'boolean',
        'missing or invalid endian');

    assert.ok(offset !== undefined && offset !== null,
        'missing offset');

    assert.ok(offset + 3 < buffer.length,
        'Trying to write beyond buffer length');

    verifsint(value, 0x7fffffff, -0x80000000);
  }

  if (value >= 0) {
    writeUInt32(buffer, value, offset, isBigEndian, noAssert);
  } else {
    writeUInt32(buffer, 0xffffffff + value + 1, offset, isBigEndian, noAssert);
  }
}

Buffer.prototype.writeInt32LE = function(value, offset, noAssert) {
  writeInt32(this, value, offset, false, noAssert);
};

Buffer.prototype.writeInt32BE = function(value, offset, noAssert) {
  writeInt32(this, value, offset, true, noAssert);
};

function writeFloat(buffer, value, offset, isBigEndian, noAssert) {
  if (!noAssert) {
    assert.ok(value !== undefined && value !== null,
        'missing value');

    assert.ok(typeof (isBigEndian) === 'boolean',
        'missing or invalid endian');

    assert.ok(offset !== undefined && offset !== null,
        'missing offset');

    assert.ok(offset + 3 < buffer.length,
        'Trying to write beyond buffer length');

    verifIEEE754(value, 3.4028234663852886e+38, -3.4028234663852886e+38);
  }

  require('./buffer_ieee754').writeIEEE754(buffer, value, offset, isBigEndian,
      23, 4);
}

Buffer.prototype.writeFloatLE = function(value, offset, noAssert) {
  writeFloat(this, value, offset, false, noAssert);
};

Buffer.prototype.writeFloatBE = function(value, offset, noAssert) {
  writeFloat(this, value, offset, true, noAssert);
};

function writeDouble(buffer, value, offset, isBigEndian, noAssert) {
  if (!noAssert) {
    assert.ok(value !== undefined && value !== null,
        'missing value');

    assert.ok(typeof (isBigEndian) === 'boolean',
        'missing or invalid endian');

    assert.ok(offset !== undefined && offset !== null,
        'missing offset');

    assert.ok(offset + 7 < buffer.length,
        'Trying to write beyond buffer length');

    verifIEEE754(value, 1.7976931348623157E+308, -1.7976931348623157E+308);
  }

  require('./buffer_ieee754').writeIEEE754(buffer, value, offset, isBigEndian,
      52, 8);
}

Buffer.prototype.writeDoubleLE = function(value, offset, noAssert) {
  writeDouble(this, value, offset, false, noAssert);
};

Buffer.prototype.writeDoubleBE = function(value, offset, noAssert) {
  writeDouble(this, value, offset, true, noAssert);
};

SlowBuffer.prototype.readUInt8 = Buffer.prototype.readUInt8;
SlowBuffer.prototype.readUInt16LE = Buffer.prototype.readUInt16LE;
SlowBuffer.prototype.readUInt16BE = Buffer.prototype.readUInt16BE;
SlowBuffer.prototype.readUInt32LE = Buffer.prototype.readUInt32LE;
SlowBuffer.prototype.readUInt32BE = Buffer.prototype.readUInt32BE;
SlowBuffer.prototype.readInt8 = Buffer.prototype.readInt8;
SlowBuffer.prototype.readInt16LE = Buffer.prototype.readInt16LE;
SlowBuffer.prototype.readInt16BE = Buffer.prototype.readInt16BE;
SlowBuffer.prototype.readInt32LE = Buffer.prototype.readInt32LE;
SlowBuffer.prototype.readInt32BE = Buffer.prototype.readInt32BE;
SlowBuffer.prototype.readFloatLE = Buffer.prototype.readFloatLE;
SlowBuffer.prototype.readFloatBE = Buffer.prototype.readFloatBE;
SlowBuffer.prototype.readDoubleLE = Buffer.prototype.readDoubleLE;
SlowBuffer.prototype.readDoubleBE = Buffer.prototype.readDoubleBE;
SlowBuffer.prototype.writeUInt8 = Buffer.prototype.writeUInt8;
SlowBuffer.prototype.writeUInt16LE = Buffer.prototype.writeUInt16LE;
SlowBuffer.prototype.writeUInt16BE = Buffer.prototype.writeUInt16BE;
SlowBuffer.prototype.writeUInt32LE = Buffer.prototype.writeUInt32LE;
SlowBuffer.prototype.writeUInt32BE = Buffer.prototype.writeUInt32BE;
SlowBuffer.prototype.writeInt8 = Buffer.prototype.writeInt8;
SlowBuffer.prototype.writeInt16LE = Buffer.prototype.writeInt16LE;
SlowBuffer.prototype.writeInt16BE = Buffer.prototype.writeInt16BE;
SlowBuffer.prototype.writeInt32LE = Buffer.prototype.writeInt32LE;
SlowBuffer.prototype.writeInt32BE = Buffer.prototype.writeInt32BE;
SlowBuffer.prototype.writeFloatLE = Buffer.prototype.writeFloatLE;
SlowBuffer.prototype.writeFloatBE = Buffer.prototype.writeFloatBE;
SlowBuffer.prototype.writeDoubleLE = Buffer.prototype.writeDoubleLE;
SlowBuffer.prototype.writeDoubleBE = Buffer.prototype.writeDoubleBE;

})()
},{"assert":2,"./buffer_ieee754":1,"base64-js":5}],3:[function(require,module,exports){
var events = require('events');

exports.isArray = isArray;
exports.isDate = function(obj){return Object.prototype.toString.call(obj) === '[object Date]'};
exports.isRegExp = function(obj){return Object.prototype.toString.call(obj) === '[object RegExp]'};


exports.print = function () {};
exports.puts = function () {};
exports.debug = function() {};

exports.inspect = function(obj, showHidden, depth, colors) {
  var seen = [];

  var stylize = function(str, styleType) {
    // http://en.wikipedia.org/wiki/ANSI_escape_code#graphics
    var styles =
        { 'bold' : [1, 22],
          'italic' : [3, 23],
          'underline' : [4, 24],
          'inverse' : [7, 27],
          'white' : [37, 39],
          'grey' : [90, 39],
          'black' : [30, 39],
          'blue' : [34, 39],
          'cyan' : [36, 39],
          'green' : [32, 39],
          'magenta' : [35, 39],
          'red' : [31, 39],
          'yellow' : [33, 39] };

    var style =
        { 'special': 'cyan',
          'number': 'blue',
          'boolean': 'yellow',
          'undefined': 'grey',
          'null': 'bold',
          'string': 'green',
          'date': 'magenta',
          // "name": intentionally not styling
          'regexp': 'red' }[styleType];

    if (style) {
      return '\033[' + styles[style][0] + 'm' + str +
             '\033[' + styles[style][1] + 'm';
    } else {
      return str;
    }
  };
  if (! colors) {
    stylize = function(str, styleType) { return str; };
  }

  function format(value, recurseTimes) {
    // Provide a hook for user-specified inspect functions.
    // Check that value is an object with an inspect function on it
    if (value && typeof value.inspect === 'function' &&
        // Filter out the util module, it's inspect function is special
        value !== exports &&
        // Also filter out any prototype objects using the circular check.
        !(value.constructor && value.constructor.prototype === value)) {
      return value.inspect(recurseTimes);
    }

    // Primitive types cannot have properties
    switch (typeof value) {
      case 'undefined':
        return stylize('undefined', 'undefined');

      case 'string':
        var simple = '\'' + JSON.stringify(value).replace(/^"|"$/g, '')
                                                 .replace(/'/g, "\\'")
                                                 .replace(/\\"/g, '"') + '\'';
        return stylize(simple, 'string');

      case 'number':
        return stylize('' + value, 'number');

      case 'boolean':
        return stylize('' + value, 'boolean');
    }
    // For some reason typeof null is "object", so special case here.
    if (value === null) {
      return stylize('null', 'null');
    }

    // Look up the keys of the object.
    var visible_keys = Object_keys(value);
    var keys = showHidden ? Object_getOwnPropertyNames(value) : visible_keys;

    // Functions without properties can be shortcutted.
    if (typeof value === 'function' && keys.length === 0) {
      if (isRegExp(value)) {
        return stylize('' + value, 'regexp');
      } else {
        var name = value.name ? ': ' + value.name : '';
        return stylize('[Function' + name + ']', 'special');
      }
    }

    // Dates without properties can be shortcutted
    if (isDate(value) && keys.length === 0) {
      return stylize(value.toUTCString(), 'date');
    }

    var base, type, braces;
    // Determine the object type
    if (isArray(value)) {
      type = 'Array';
      braces = ['[', ']'];
    } else {
      type = 'Object';
      braces = ['{', '}'];
    }

    // Make functions say that they are functions
    if (typeof value === 'function') {
      var n = value.name ? ': ' + value.name : '';
      base = (isRegExp(value)) ? ' ' + value : ' [Function' + n + ']';
    } else {
      base = '';
    }

    // Make dates with properties first say the date
    if (isDate(value)) {
      base = ' ' + value.toUTCString();
    }

    if (keys.length === 0) {
      return braces[0] + base + braces[1];
    }

    if (recurseTimes < 0) {
      if (isRegExp(value)) {
        return stylize('' + value, 'regexp');
      } else {
        return stylize('[Object]', 'special');
      }
    }

    seen.push(value);

    var output = keys.map(function(key) {
      var name, str;
      if (value.__lookupGetter__) {
        if (value.__lookupGetter__(key)) {
          if (value.__lookupSetter__(key)) {
            str = stylize('[Getter/Setter]', 'special');
          } else {
            str = stylize('[Getter]', 'special');
          }
        } else {
          if (value.__lookupSetter__(key)) {
            str = stylize('[Setter]', 'special');
          }
        }
      }
      if (visible_keys.indexOf(key) < 0) {
        name = '[' + key + ']';
      }
      if (!str) {
        if (seen.indexOf(value[key]) < 0) {
          if (recurseTimes === null) {
            str = format(value[key]);
          } else {
            str = format(value[key], recurseTimes - 1);
          }
          if (str.indexOf('\n') > -1) {
            if (isArray(value)) {
              str = str.split('\n').map(function(line) {
                return '  ' + line;
              }).join('\n').substr(2);
            } else {
              str = '\n' + str.split('\n').map(function(line) {
                return '   ' + line;
              }).join('\n');
            }
          }
        } else {
          str = stylize('[Circular]', 'special');
        }
      }
      if (typeof name === 'undefined') {
        if (type === 'Array' && key.match(/^\d+$/)) {
          return str;
        }
        name = JSON.stringify('' + key);
        if (name.match(/^"([a-zA-Z_][a-zA-Z_0-9]*)"$/)) {
          name = name.substr(1, name.length - 2);
          name = stylize(name, 'name');
        } else {
          name = name.replace(/'/g, "\\'")
                     .replace(/\\"/g, '"')
                     .replace(/(^"|"$)/g, "'");
          name = stylize(name, 'string');
        }
      }

      return name + ': ' + str;
    });

    seen.pop();

    var numLinesEst = 0;
    var length = output.reduce(function(prev, cur) {
      numLinesEst++;
      if (cur.indexOf('\n') >= 0) numLinesEst++;
      return prev + cur.length + 1;
    }, 0);

    if (length > 50) {
      output = braces[0] +
               (base === '' ? '' : base + '\n ') +
               ' ' +
               output.join(',\n  ') +
               ' ' +
               braces[1];

    } else {
      output = braces[0] + base + ' ' + output.join(', ') + ' ' + braces[1];
    }

    return output;
  }
  return format(obj, (typeof depth === 'undefined' ? 2 : depth));
};


function isArray(ar) {
  return ar instanceof Array ||
         Array.isArray(ar) ||
         (ar && ar !== Object.prototype && isArray(ar.__proto__));
}


function isRegExp(re) {
  return re instanceof RegExp ||
    (typeof re === 'object' && Object.prototype.toString.call(re) === '[object RegExp]');
}


function isDate(d) {
  if (d instanceof Date) return true;
  if (typeof d !== 'object') return false;
  var properties = Date.prototype && Object_getOwnPropertyNames(Date.prototype);
  var proto = d.__proto__ && Object_getOwnPropertyNames(d.__proto__);
  return JSON.stringify(proto) === JSON.stringify(properties);
}

function pad(n) {
  return n < 10 ? '0' + n.toString(10) : n.toString(10);
}

var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep',
              'Oct', 'Nov', 'Dec'];

// 26 Feb 16:19:34
function timestamp() {
  var d = new Date();
  var time = [pad(d.getHours()),
              pad(d.getMinutes()),
              pad(d.getSeconds())].join(':');
  return [d.getDate(), months[d.getMonth()], time].join(' ');
}

exports.log = function (msg) {};

exports.pump = null;

var Object_keys = Object.keys || function (obj) {
    var res = [];
    for (var key in obj) res.push(key);
    return res;
};

var Object_getOwnPropertyNames = Object.getOwnPropertyNames || function (obj) {
    var res = [];
    for (var key in obj) {
        if (Object.hasOwnProperty.call(obj, key)) res.push(key);
    }
    return res;
};

var Object_create = Object.create || function (prototype, properties) {
    // from es5-shim
    var object;
    if (prototype === null) {
        object = { '__proto__' : null };
    }
    else {
        if (typeof prototype !== 'object') {
            throw new TypeError(
                'typeof prototype[' + (typeof prototype) + '] != \'object\''
            );
        }
        var Type = function () {};
        Type.prototype = prototype;
        object = new Type();
        object.__proto__ = prototype;
    }
    if (typeof properties !== 'undefined' && Object.defineProperties) {
        Object.defineProperties(object, properties);
    }
    return object;
};

exports.inherits = function(ctor, superCtor) {
  ctor.super_ = superCtor;
  ctor.prototype = Object_create(superCtor.prototype, {
    constructor: {
      value: ctor,
      enumerable: false,
      writable: true,
      configurable: true
    }
  });
};

var formatRegExp = /%[sdj%]/g;
exports.format = function(f) {
  if (typeof f !== 'string') {
    var objects = [];
    for (var i = 0; i < arguments.length; i++) {
      objects.push(exports.inspect(arguments[i]));
    }
    return objects.join(' ');
  }

  var i = 1;
  var args = arguments;
  var len = args.length;
  var str = String(f).replace(formatRegExp, function(x) {
    if (x === '%%') return '%';
    if (i >= len) return x;
    switch (x) {
      case '%s': return String(args[i++]);
      case '%d': return Number(args[i++]);
      case '%j': return JSON.stringify(args[i++]);
      default:
        return x;
    }
  });
  for(var x = args[i]; i < len; x = args[++i]){
    if (x === null || typeof x !== 'object') {
      str += ' ' + x;
    } else {
      str += ' ' + exports.inspect(x);
    }
  }
  return str;
};

},{"events":6}],5:[function(require,module,exports){
(function (exports) {
	'use strict';

	var lookup = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

	function b64ToByteArray(b64) {
		var i, j, l, tmp, placeHolders, arr;
	
		if (b64.length % 4 > 0) {
			throw 'Invalid string. Length must be a multiple of 4';
		}

		// the number of equal signs (place holders)
		// if there are two placeholders, than the two characters before it
		// represent one byte
		// if there is only one, then the three characters before it represent 2 bytes
		// this is just a cheap hack to not do indexOf twice
		placeHolders = b64.indexOf('=');
		placeHolders = placeHolders > 0 ? b64.length - placeHolders : 0;

		// base64 is 4/3 + up to two characters of the original data
		arr = [];//new Uint8Array(b64.length * 3 / 4 - placeHolders);

		// if there are placeholders, only get up to the last complete 4 chars
		l = placeHolders > 0 ? b64.length - 4 : b64.length;

		for (i = 0, j = 0; i < l; i += 4, j += 3) {
			tmp = (lookup.indexOf(b64[i]) << 18) | (lookup.indexOf(b64[i + 1]) << 12) | (lookup.indexOf(b64[i + 2]) << 6) | lookup.indexOf(b64[i + 3]);
			arr.push((tmp & 0xFF0000) >> 16);
			arr.push((tmp & 0xFF00) >> 8);
			arr.push(tmp & 0xFF);
		}

		if (placeHolders === 2) {
			tmp = (lookup.indexOf(b64[i]) << 2) | (lookup.indexOf(b64[i + 1]) >> 4);
			arr.push(tmp & 0xFF);
		} else if (placeHolders === 1) {
			tmp = (lookup.indexOf(b64[i]) << 10) | (lookup.indexOf(b64[i + 1]) << 4) | (lookup.indexOf(b64[i + 2]) >> 2);
			arr.push((tmp >> 8) & 0xFF);
			arr.push(tmp & 0xFF);
		}

		return arr;
	}

	function uint8ToBase64(uint8) {
		var i,
			extraBytes = uint8.length % 3, // if we have 1 byte left, pad 2 bytes
			output = "",
			temp, length;

		function tripletToBase64 (num) {
			return lookup[num >> 18 & 0x3F] + lookup[num >> 12 & 0x3F] + lookup[num >> 6 & 0x3F] + lookup[num & 0x3F];
		};

		// go through the array every three bytes, we'll deal with trailing stuff later
		for (i = 0, length = uint8.length - extraBytes; i < length; i += 3) {
			temp = (uint8[i] << 16) + (uint8[i + 1] << 8) + (uint8[i + 2]);
			output += tripletToBase64(temp);
		}

		// pad the end with zeros, but make sure to not forget the extra bytes
		switch (extraBytes) {
			case 1:
				temp = uint8[uint8.length - 1];
				output += lookup[temp >> 2];
				output += lookup[(temp << 4) & 0x3F];
				output += '==';
				break;
			case 2:
				temp = (uint8[uint8.length - 2] << 8) + (uint8[uint8.length - 1]);
				output += lookup[temp >> 10];
				output += lookup[(temp >> 4) & 0x3F];
				output += lookup[(temp << 2) & 0x3F];
				output += '=';
				break;
		}

		return output;
	}

	module.exports.toByteArray = b64ToByteArray;
	module.exports.fromByteArray = uint8ToBase64;
}());

},{}],7:[function(require,module,exports){
exports.readIEEE754 = function(buffer, offset, isBE, mLen, nBytes) {
  var e, m,
      eLen = nBytes * 8 - mLen - 1,
      eMax = (1 << eLen) - 1,
      eBias = eMax >> 1,
      nBits = -7,
      i = isBE ? 0 : (nBytes - 1),
      d = isBE ? 1 : -1,
      s = buffer[offset + i];

  i += d;

  e = s & ((1 << (-nBits)) - 1);
  s >>= (-nBits);
  nBits += eLen;
  for (; nBits > 0; e = e * 256 + buffer[offset + i], i += d, nBits -= 8);

  m = e & ((1 << (-nBits)) - 1);
  e >>= (-nBits);
  nBits += mLen;
  for (; nBits > 0; m = m * 256 + buffer[offset + i], i += d, nBits -= 8);

  if (e === 0) {
    e = 1 - eBias;
  } else if (e === eMax) {
    return m ? NaN : ((s ? -1 : 1) * Infinity);
  } else {
    m = m + Math.pow(2, mLen);
    e = e - eBias;
  }
  return (s ? -1 : 1) * m * Math.pow(2, e - mLen);
};

exports.writeIEEE754 = function(buffer, value, offset, isBE, mLen, nBytes) {
  var e, m, c,
      eLen = nBytes * 8 - mLen - 1,
      eMax = (1 << eLen) - 1,
      eBias = eMax >> 1,
      rt = (mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0),
      i = isBE ? (nBytes - 1) : 0,
      d = isBE ? -1 : 1,
      s = value < 0 || (value === 0 && 1 / value < 0) ? 1 : 0;

  value = Math.abs(value);

  if (isNaN(value) || value === Infinity) {
    m = isNaN(value) ? 1 : 0;
    e = eMax;
  } else {
    e = Math.floor(Math.log(value) / Math.LN2);
    if (value * (c = Math.pow(2, -e)) < 1) {
      e--;
      c *= 2;
    }
    if (e + eBias >= 1) {
      value += rt / c;
    } else {
      value += rt * Math.pow(2, 1 - eBias);
    }
    if (value * c >= 2) {
      e++;
      c /= 2;
    }

    if (e + eBias >= eMax) {
      m = 0;
      e = eMax;
    } else if (e + eBias >= 1) {
      m = (value * c - 1) * Math.pow(2, mLen);
      e = e + eBias;
    } else {
      m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen);
      e = 0;
    }
  }

  for (; mLen >= 8; buffer[offset + i] = m & 0xff, i += d, m /= 256, mLen -= 8);

  e = (e << mLen) | m;
  eLen += mLen;
  for (; eLen > 0; buffer[offset + i] = e & 0xff, i += d, e /= 256, eLen -= 8);

  buffer[offset + i - d] |= s * 128;
};

},{}],8:[function(require,module,exports){
// shim for using process in browser

var process = module.exports = {};

process.nextTick = (function () {
    var canSetImmediate = typeof window !== 'undefined'
    && window.setImmediate;
    var canPost = typeof window !== 'undefined'
    && window.postMessage && window.addEventListener
    ;

    if (canSetImmediate) {
        return function (f) { return window.setImmediate(f) };
    }

    if (canPost) {
        var queue = [];
        window.addEventListener('message', function (ev) {
            if (ev.source === window && ev.data === 'process-tick') {
                ev.stopPropagation();
                if (queue.length > 0) {
                    var fn = queue.shift();
                    fn();
                }
            }
        }, true);

        return function nextTick(fn) {
            queue.push(fn);
            window.postMessage('process-tick', '*');
        };
    }

    return function nextTick(fn) {
        setTimeout(fn, 0);
    };
})();

process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];

process.binding = function (name) {
    throw new Error('process.binding is not supported');
}

// TODO(shtylman)
process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};

},{}],6:[function(require,module,exports){
(function(process){if (!process.EventEmitter) process.EventEmitter = function () {};

var EventEmitter = exports.EventEmitter = process.EventEmitter;
var isArray = typeof Array.isArray === 'function'
    ? Array.isArray
    : function (xs) {
        return Object.prototype.toString.call(xs) === '[object Array]'
    }
;
function indexOf (xs, x) {
    if (xs.indexOf) return xs.indexOf(x);
    for (var i = 0; i < xs.length; i++) {
        if (x === xs[i]) return i;
    }
    return -1;
}

// By default EventEmitters will print a warning if more than
// 10 listeners are added to it. This is a useful default which
// helps finding memory leaks.
//
// Obviously not all Emitters should be limited to 10. This function allows
// that to be increased. Set to zero for unlimited.
var defaultMaxListeners = 10;
EventEmitter.prototype.setMaxListeners = function(n) {
  if (!this._events) this._events = {};
  this._events.maxListeners = n;
};


EventEmitter.prototype.emit = function(type) {
  // If there is no 'error' event listener then throw.
  if (type === 'error') {
    if (!this._events || !this._events.error ||
        (isArray(this._events.error) && !this._events.error.length))
    {
      if (arguments[1] instanceof Error) {
        throw arguments[1]; // Unhandled 'error' event
      } else {
        throw new Error("Uncaught, unspecified 'error' event.");
      }
      return false;
    }
  }

  if (!this._events) return false;
  var handler = this._events[type];
  if (!handler) return false;

  if (typeof handler == 'function') {
    switch (arguments.length) {
      // fast cases
      case 1:
        handler.call(this);
        break;
      case 2:
        handler.call(this, arguments[1]);
        break;
      case 3:
        handler.call(this, arguments[1], arguments[2]);
        break;
      // slower
      default:
        var args = Array.prototype.slice.call(arguments, 1);
        handler.apply(this, args);
    }
    return true;

  } else if (isArray(handler)) {
    var args = Array.prototype.slice.call(arguments, 1);

    var listeners = handler.slice();
    for (var i = 0, l = listeners.length; i < l; i++) {
      listeners[i].apply(this, args);
    }
    return true;

  } else {
    return false;
  }
};

// EventEmitter is defined in src/node_events.cc
// EventEmitter.prototype.emit() is also defined there.
EventEmitter.prototype.addListener = function(type, listener) {
  if ('function' !== typeof listener) {
    throw new Error('addListener only takes instances of Function');
  }

  if (!this._events) this._events = {};

  // To avoid recursion in the case that type == "newListeners"! Before
  // adding it to the listeners, first emit "newListeners".
  this.emit('newListener', type, listener);

  if (!this._events[type]) {
    // Optimize the case of one listener. Don't need the extra array object.
    this._events[type] = listener;
  } else if (isArray(this._events[type])) {

    // Check for listener leak
    if (!this._events[type].warned) {
      var m;
      if (this._events.maxListeners !== undefined) {
        m = this._events.maxListeners;
      } else {
        m = defaultMaxListeners;
      }

      if (m && m > 0 && this._events[type].length > m) {
        this._events[type].warned = true;
        console.error('(node) warning: possible EventEmitter memory ' +
                      'leak detected. %d listeners added. ' +
                      'Use emitter.setMaxListeners() to increase limit.',
                      this._events[type].length);
        console.trace();
      }
    }

    // If we've already got an array, just append.
    this._events[type].push(listener);
  } else {
    // Adding the second element, need to change to array.
    this._events[type] = [this._events[type], listener];
  }

  return this;
};

EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.once = function(type, listener) {
  var self = this;
  self.on(type, function g() {
    self.removeListener(type, g);
    listener.apply(this, arguments);
  });

  return this;
};

EventEmitter.prototype.removeListener = function(type, listener) {
  if ('function' !== typeof listener) {
    throw new Error('removeListener only takes instances of Function');
  }

  // does not use listeners(), so no side effect of creating _events[type]
  if (!this._events || !this._events[type]) return this;

  var list = this._events[type];

  if (isArray(list)) {
    var i = indexOf(list, listener);
    if (i < 0) return this;
    list.splice(i, 1);
    if (list.length == 0)
      delete this._events[type];
  } else if (this._events[type] === listener) {
    delete this._events[type];
  }

  return this;
};

EventEmitter.prototype.removeAllListeners = function(type) {
  if (arguments.length === 0) {
    this._events = {};
    return this;
  }

  // does not use listeners(), so no side effect of creating _events[type]
  if (type && this._events && this._events[type]) this._events[type] = null;
  return this;
};

EventEmitter.prototype.listeners = function(type) {
  if (!this._events) this._events = {};
  if (!this._events[type]) this._events[type] = [];
  if (!isArray(this._events[type])) {
    this._events[type] = [this._events[type]];
  }
  return this._events[type];
};

})(require("__browserify_process"))
},{"__browserify_process":8}],4:[function(require,module,exports){
(function(){function SlowBuffer (size) {
    this.length = size;
};

var assert = require('assert');

exports.INSPECT_MAX_BYTES = 50;


function toHex(n) {
  if (n < 16) return '0' + n.toString(16);
  return n.toString(16);
}

function utf8ToBytes(str) {
  var byteArray = [];
  for (var i = 0; i < str.length; i++)
    if (str.charCodeAt(i) <= 0x7F)
      byteArray.push(str.charCodeAt(i));
    else {
      var h = encodeURIComponent(str.charAt(i)).substr(1).split('%');
      for (var j = 0; j < h.length; j++)
        byteArray.push(parseInt(h[j], 16));
    }

  return byteArray;
}

function asciiToBytes(str) {
  var byteArray = []
  for (var i = 0; i < str.length; i++ )
    // Node's code seems to be doing this and not & 0x7F..
    byteArray.push( str.charCodeAt(i) & 0xFF );

  return byteArray;
}

function base64ToBytes(str) {
  return require("base64-js").toByteArray(str);
}

SlowBuffer.byteLength = function (str, encoding) {
  switch (encoding || "utf8") {
    case 'hex':
      return str.length / 2;

    case 'utf8':
    case 'utf-8':
      return utf8ToBytes(str).length;

    case 'ascii':
      return str.length;

    case 'base64':
      return base64ToBytes(str).length;

    default:
      throw new Error('Unknown encoding');
  }
};

function blitBuffer(src, dst, offset, length) {
  var pos, i = 0;
  while (i < length) {
    if ((i+offset >= dst.length) || (i >= src.length))
      break;

    dst[i + offset] = src[i];
    i++;
  }
  return i;
}

SlowBuffer.prototype.utf8Write = function (string, offset, length) {
  var bytes, pos;
  return SlowBuffer._charsWritten =  blitBuffer(utf8ToBytes(string), this, offset, length);
};

SlowBuffer.prototype.asciiWrite = function (string, offset, length) {
  var bytes, pos;
  return SlowBuffer._charsWritten =  blitBuffer(asciiToBytes(string), this, offset, length);
};

SlowBuffer.prototype.base64Write = function (string, offset, length) {
  var bytes, pos;
  return SlowBuffer._charsWritten = blitBuffer(base64ToBytes(string), this, offset, length);
};

SlowBuffer.prototype.base64Slice = function (start, end) {
  var bytes = Array.prototype.slice.apply(this, arguments)
  return require("base64-js").fromByteArray(bytes);
}

function decodeUtf8Char(str) {
  try {
    return decodeURIComponent(str);
  } catch (err) {
    return String.fromCharCode(0xFFFD); // UTF 8 invalid char
  }
}

SlowBuffer.prototype.utf8Slice = function () {
  var bytes = Array.prototype.slice.apply(this, arguments);
  var res = "";
  var tmp = "";
  var i = 0;
  while (i < bytes.length) {
    if (bytes[i] <= 0x7F) {
      res += decodeUtf8Char(tmp) + String.fromCharCode(bytes[i]);
      tmp = "";
    } else
      tmp += "%" + bytes[i].toString(16);

    i++;
  }

  return res + decodeUtf8Char(tmp);
}

SlowBuffer.prototype.asciiSlice = function () {
  var bytes = Array.prototype.slice.apply(this, arguments);
  var ret = "";
  for (var i = 0; i < bytes.length; i++)
    ret += String.fromCharCode(bytes[i]);
  return ret;
}

SlowBuffer.prototype.inspect = function() {
  var out = [],
      len = this.length;
  for (var i = 0; i < len; i++) {
    out[i] = toHex(this[i]);
    if (i == exports.INSPECT_MAX_BYTES) {
      out[i + 1] = '...';
      break;
    }
  }
  return '<SlowBuffer ' + out.join(' ') + '>';
};


SlowBuffer.prototype.hexSlice = function(start, end) {
  var len = this.length;

  if (!start || start < 0) start = 0;
  if (!end || end < 0 || end > len) end = len;

  var out = '';
  for (var i = start; i < end; i++) {
    out += toHex(this[i]);
  }
  return out;
};


SlowBuffer.prototype.toString = function(encoding, start, end) {
  encoding = String(encoding || 'utf8').toLowerCase();
  start = +start || 0;
  if (typeof end == 'undefined') end = this.length;

  // Fastpath empty strings
  if (+end == start) {
    return '';
  }

  switch (encoding) {
    case 'hex':
      return this.hexSlice(start, end);

    case 'utf8':
    case 'utf-8':
      return this.utf8Slice(start, end);

    case 'ascii':
      return this.asciiSlice(start, end);

    case 'binary':
      return this.binarySlice(start, end);

    case 'base64':
      return this.base64Slice(start, end);

    case 'ucs2':
    case 'ucs-2':
      return this.ucs2Slice(start, end);

    default:
      throw new Error('Unknown encoding');
  }
};


SlowBuffer.prototype.hexWrite = function(string, offset, length) {
  offset = +offset || 0;
  var remaining = this.length - offset;
  if (!length) {
    length = remaining;
  } else {
    length = +length;
    if (length > remaining) {
      length = remaining;
    }
  }

  // must be an even number of digits
  var strLen = string.length;
  if (strLen % 2) {
    throw new Error('Invalid hex string');
  }
  if (length > strLen / 2) {
    length = strLen / 2;
  }
  for (var i = 0; i < length; i++) {
    var byte = parseInt(string.substr(i * 2, 2), 16);
    if (isNaN(byte)) throw new Error('Invalid hex string');
    this[offset + i] = byte;
  }
  SlowBuffer._charsWritten = i * 2;
  return i;
};


SlowBuffer.prototype.write = function(string, offset, length, encoding) {
  // Support both (string, offset, length, encoding)
  // and the legacy (string, encoding, offset, length)
  if (isFinite(offset)) {
    if (!isFinite(length)) {
      encoding = length;
      length = undefined;
    }
  } else {  // legacy
    var swap = encoding;
    encoding = offset;
    offset = length;
    length = swap;
  }

  offset = +offset || 0;
  var remaining = this.length - offset;
  if (!length) {
    length = remaining;
  } else {
    length = +length;
    if (length > remaining) {
      length = remaining;
    }
  }
  encoding = String(encoding || 'utf8').toLowerCase();

  switch (encoding) {
    case 'hex':
      return this.hexWrite(string, offset, length);

    case 'utf8':
    case 'utf-8':
      return this.utf8Write(string, offset, length);

    case 'ascii':
      return this.asciiWrite(string, offset, length);

    case 'binary':
      return this.binaryWrite(string, offset, length);

    case 'base64':
      return this.base64Write(string, offset, length);

    case 'ucs2':
    case 'ucs-2':
      return this.ucs2Write(string, offset, length);

    default:
      throw new Error('Unknown encoding');
  }
};


// slice(start, end)
SlowBuffer.prototype.slice = function(start, end) {
  if (end === undefined) end = this.length;

  if (end > this.length) {
    throw new Error('oob');
  }
  if (start > end) {
    throw new Error('oob');
  }

  return new Buffer(this, end - start, +start);
};

SlowBuffer.prototype.copy = function(target, targetstart, sourcestart, sourceend) {
  var temp = [];
  for (var i=sourcestart; i<sourceend; i++) {
    assert.ok(typeof this[i] !== 'undefined', "copying undefined buffer bytes!");
    temp.push(this[i]);
  }

  for (var i=targetstart; i<targetstart+temp.length; i++) {
    target[i] = temp[i-targetstart];
  }
};

function coerce(length) {
  // Coerce length to a number (possibly NaN), round up
  // in case it's fractional (e.g. 123.456) then do a
  // double negate to coerce a NaN to 0. Easy, right?
  length = ~~Math.ceil(+length);
  return length < 0 ? 0 : length;
}


// Buffer

function Buffer(subject, encoding, offset) {
  if (!(this instanceof Buffer)) {
    return new Buffer(subject, encoding, offset);
  }

  var type;

  // Are we slicing?
  if (typeof offset === 'number') {
    this.length = coerce(encoding);
    this.parent = subject;
    this.offset = offset;
  } else {
    // Find the length
    switch (type = typeof subject) {
      case 'number':
        this.length = coerce(subject);
        break;

      case 'string':
        this.length = Buffer.byteLength(subject, encoding);
        break;

      case 'object': // Assume object is an array
        this.length = coerce(subject.length);
        break;

      default:
        throw new Error('First argument needs to be a number, ' +
                        'array or string.');
    }

    if (this.length > Buffer.poolSize) {
      // Big buffer, just alloc one.
      this.parent = new SlowBuffer(this.length);
      this.offset = 0;

    } else {
      // Small buffer.
      if (!pool || pool.length - pool.used < this.length) allocPool();
      this.parent = pool;
      this.offset = pool.used;
      pool.used += this.length;
    }

    // Treat array-ish objects as a byte array.
    if (isArrayIsh(subject)) {
      for (var i = 0; i < this.length; i++) {
        this.parent[i + this.offset] = subject[i];
      }
    } else if (type == 'string') {
      // We are a string
      this.length = this.write(subject, 0, encoding);
    }
  }

}

function isArrayIsh(subject) {
  return Array.isArray(subject) || Buffer.isBuffer(subject) ||
         subject && typeof subject === 'object' &&
         typeof subject.length === 'number';
}

exports.SlowBuffer = SlowBuffer;
exports.Buffer = Buffer;

Buffer.poolSize = 8 * 1024;
var pool;

function allocPool() {
  pool = new SlowBuffer(Buffer.poolSize);
  pool.used = 0;
}


// Static methods
Buffer.isBuffer = function isBuffer(b) {
  return b instanceof Buffer || b instanceof SlowBuffer;
};

Buffer.concat = function (list, totalLength) {
  if (!Array.isArray(list)) {
    throw new Error("Usage: Buffer.concat(list, [totalLength])\n \
      list should be an Array.");
  }

  if (list.length === 0) {
    return new Buffer(0);
  } else if (list.length === 1) {
    return list[0];
  }

  if (typeof totalLength !== 'number') {
    totalLength = 0;
    for (var i = 0; i < list.length; i++) {
      var buf = list[i];
      totalLength += buf.length;
    }
  }

  var buffer = new Buffer(totalLength);
  var pos = 0;
  for (var i = 0; i < list.length; i++) {
    var buf = list[i];
    buf.copy(buffer, pos);
    pos += buf.length;
  }
  return buffer;
};

// Inspect
Buffer.prototype.inspect = function inspect() {
  var out = [],
      len = this.length;

  for (var i = 0; i < len; i++) {
    out[i] = toHex(this.parent[i + this.offset]);
    if (i == exports.INSPECT_MAX_BYTES) {
      out[i + 1] = '...';
      break;
    }
  }

  return '<Buffer ' + out.join(' ') + '>';
};


Buffer.prototype.get = function get(i) {
  if (i < 0 || i >= this.length) throw new Error('oob');
  return this.parent[this.offset + i];
};


Buffer.prototype.set = function set(i, v) {
  if (i < 0 || i >= this.length) throw new Error('oob');
  return this.parent[this.offset + i] = v;
};


// write(string, offset = 0, length = buffer.length-offset, encoding = 'utf8')
Buffer.prototype.write = function(string, offset, length, encoding) {
  // Support both (string, offset, length, encoding)
  // and the legacy (string, encoding, offset, length)
  if (isFinite(offset)) {
    if (!isFinite(length)) {
      encoding = length;
      length = undefined;
    }
  } else {  // legacy
    var swap = encoding;
    encoding = offset;
    offset = length;
    length = swap;
  }

  offset = +offset || 0;
  var remaining = this.length - offset;
  if (!length) {
    length = remaining;
  } else {
    length = +length;
    if (length > remaining) {
      length = remaining;
    }
  }
  encoding = String(encoding || 'utf8').toLowerCase();

  var ret;
  switch (encoding) {
    case 'hex':
      ret = this.parent.hexWrite(string, this.offset + offset, length);
      break;

    case 'utf8':
    case 'utf-8':
      ret = this.parent.utf8Write(string, this.offset + offset, length);
      break;

    case 'ascii':
      ret = this.parent.asciiWrite(string, this.offset + offset, length);
      break;

    case 'binary':
      ret = this.parent.binaryWrite(string, this.offset + offset, length);
      break;

    case 'base64':
      // Warning: maxLength not taken into account in base64Write
      ret = this.parent.base64Write(string, this.offset + offset, length);
      break;

    case 'ucs2':
    case 'ucs-2':
      ret = this.parent.ucs2Write(string, this.offset + offset, length);
      break;

    default:
      throw new Error('Unknown encoding');
  }

  Buffer._charsWritten = SlowBuffer._charsWritten;

  return ret;
};


// toString(encoding, start=0, end=buffer.length)
Buffer.prototype.toString = function(encoding, start, end) {
  encoding = String(encoding || 'utf8').toLowerCase();

  if (typeof start == 'undefined' || start < 0) {
    start = 0;
  } else if (start > this.length) {
    start = this.length;
  }

  if (typeof end == 'undefined' || end > this.length) {
    end = this.length;
  } else if (end < 0) {
    end = 0;
  }

  start = start + this.offset;
  end = end + this.offset;

  switch (encoding) {
    case 'hex':
      return this.parent.hexSlice(start, end);

    case 'utf8':
    case 'utf-8':
      return this.parent.utf8Slice(start, end);

    case 'ascii':
      return this.parent.asciiSlice(start, end);

    case 'binary':
      return this.parent.binarySlice(start, end);

    case 'base64':
      return this.parent.base64Slice(start, end);

    case 'ucs2':
    case 'ucs-2':
      return this.parent.ucs2Slice(start, end);

    default:
      throw new Error('Unknown encoding');
  }
};


// byteLength
Buffer.byteLength = SlowBuffer.byteLength;


// fill(value, start=0, end=buffer.length)
Buffer.prototype.fill = function fill(value, start, end) {
  value || (value = 0);
  start || (start = 0);
  end || (end = this.length);

  if (typeof value === 'string') {
    value = value.charCodeAt(0);
  }
  if (!(typeof value === 'number') || isNaN(value)) {
    throw new Error('value is not a number');
  }

  if (end < start) throw new Error('end < start');

  // Fill 0 bytes; we're done
  if (end === start) return 0;
  if (this.length == 0) return 0;

  if (start < 0 || start >= this.length) {
    throw new Error('start out of bounds');
  }

  if (end < 0 || end > this.length) {
    throw new Error('end out of bounds');
  }

  return this.parent.fill(value,
                          start + this.offset,
                          end + this.offset);
};


// copy(targetBuffer, targetStart=0, sourceStart=0, sourceEnd=buffer.length)
Buffer.prototype.copy = function(target, target_start, start, end) {
  var source = this;
  start || (start = 0);
  end || (end = this.length);
  target_start || (target_start = 0);

  if (end < start) throw new Error('sourceEnd < sourceStart');

  // Copy 0 bytes; we're done
  if (end === start) return 0;
  if (target.length == 0 || source.length == 0) return 0;

  if (target_start < 0 || target_start >= target.length) {
    throw new Error('targetStart out of bounds');
  }

  if (start < 0 || start >= source.length) {
    throw new Error('sourceStart out of bounds');
  }

  if (end < 0 || end > source.length) {
    throw new Error('sourceEnd out of bounds');
  }

  // Are we oob?
  if (end > this.length) {
    end = this.length;
  }

  if (target.length - target_start < end - start) {
    end = target.length - target_start + start;
  }

  return this.parent.copy(target.parent,
                          target_start + target.offset,
                          start + this.offset,
                          end + this.offset);
};


// slice(start, end)
Buffer.prototype.slice = function(start, end) {
  if (end === undefined) end = this.length;
  if (end > this.length) throw new Error('oob');
  if (start > end) throw new Error('oob');

  return new Buffer(this.parent, end - start, +start + this.offset);
};


// Legacy methods for backwards compatibility.

Buffer.prototype.utf8Slice = function(start, end) {
  return this.toString('utf8', start, end);
};

Buffer.prototype.binarySlice = function(start, end) {
  return this.toString('binary', start, end);
};

Buffer.prototype.asciiSlice = function(start, end) {
  return this.toString('ascii', start, end);
};

Buffer.prototype.utf8Write = function(string, offset) {
  return this.write(string, offset, 'utf8');
};

Buffer.prototype.binaryWrite = function(string, offset) {
  return this.write(string, offset, 'binary');
};

Buffer.prototype.asciiWrite = function(string, offset) {
  return this.write(string, offset, 'ascii');
};

Buffer.prototype.readUInt8 = function(offset, noAssert) {
  var buffer = this;

  if (!noAssert) {
    assert.ok(offset !== undefined && offset !== null,
        'missing offset');

    assert.ok(offset < buffer.length,
        'Trying to read beyond buffer length');
  }

  return buffer.parent[buffer.offset + offset];
};

function readUInt16(buffer, offset, isBigEndian, noAssert) {
  var val = 0;


  if (!noAssert) {
    assert.ok(typeof (isBigEndian) === 'boolean',
        'missing or invalid endian');

    assert.ok(offset !== undefined && offset !== null,
        'missing offset');

    assert.ok(offset + 1 < buffer.length,
        'Trying to read beyond buffer length');
  }

  if (isBigEndian) {
    val = buffer.parent[buffer.offset + offset] << 8;
    val |= buffer.parent[buffer.offset + offset + 1];
  } else {
    val = buffer.parent[buffer.offset + offset];
    val |= buffer.parent[buffer.offset + offset + 1] << 8;
  }

  return val;
}

Buffer.prototype.readUInt16LE = function(offset, noAssert) {
  return readUInt16(this, offset, false, noAssert);
};

Buffer.prototype.readUInt16BE = function(offset, noAssert) {
  return readUInt16(this, offset, true, noAssert);
};

function readUInt32(buffer, offset, isBigEndian, noAssert) {
  var val = 0;

  if (!noAssert) {
    assert.ok(typeof (isBigEndian) === 'boolean',
        'missing or invalid endian');

    assert.ok(offset !== undefined && offset !== null,
        'missing offset');

    assert.ok(offset + 3 < buffer.length,
        'Trying to read beyond buffer length');
  }

  if (isBigEndian) {
    val = buffer.parent[buffer.offset + offset + 1] << 16;
    val |= buffer.parent[buffer.offset + offset + 2] << 8;
    val |= buffer.parent[buffer.offset + offset + 3];
    val = val + (buffer.parent[buffer.offset + offset] << 24 >>> 0);
  } else {
    val = buffer.parent[buffer.offset + offset + 2] << 16;
    val |= buffer.parent[buffer.offset + offset + 1] << 8;
    val |= buffer.parent[buffer.offset + offset];
    val = val + (buffer.parent[buffer.offset + offset + 3] << 24 >>> 0);
  }

  return val;
}

Buffer.prototype.readUInt32LE = function(offset, noAssert) {
  return readUInt32(this, offset, false, noAssert);
};

Buffer.prototype.readUInt32BE = function(offset, noAssert) {
  return readUInt32(this, offset, true, noAssert);
};


/*
 * Signed integer types, yay team! A reminder on how two's complement actually
 * works. The first bit is the signed bit, i.e. tells us whether or not the
 * number should be positive or negative. If the two's complement value is
 * positive, then we're done, as it's equivalent to the unsigned representation.
 *
 * Now if the number is positive, you're pretty much done, you can just leverage
 * the unsigned translations and return those. Unfortunately, negative numbers
 * aren't quite that straightforward.
 *
 * At first glance, one might be inclined to use the traditional formula to
 * translate binary numbers between the positive and negative values in two's
 * complement. (Though it doesn't quite work for the most negative value)
 * Mainly:
 *  - invert all the bits
 *  - add one to the result
 *
 * Of course, this doesn't quite work in Javascript. Take for example the value
 * of -128. This could be represented in 16 bits (big-endian) as 0xff80. But of
 * course, Javascript will do the following:
 *
 * > ~0xff80
 * -65409
 *
 * Whoh there, Javascript, that's not quite right. But wait, according to
 * Javascript that's perfectly correct. When Javascript ends up seeing the
 * constant 0xff80, it has no notion that it is actually a signed number. It
 * assumes that we've input the unsigned value 0xff80. Thus, when it does the
 * binary negation, it casts it into a signed value, (positive 0xff80). Then
 * when you perform binary negation on that, it turns it into a negative number.
 *
 * Instead, we're going to have to use the following general formula, that works
 * in a rather Javascript friendly way. I'm glad we don't support this kind of
 * weird numbering scheme in the kernel.
 *
 * (BIT-MAX - (unsigned)val + 1) * -1
 *
 * The astute observer, may think that this doesn't make sense for 8-bit numbers
 * (really it isn't necessary for them). However, when you get 16-bit numbers,
 * you do. Let's go back to our prior example and see how this will look:
 *
 * (0xffff - 0xff80 + 1) * -1
 * (0x007f + 1) * -1
 * (0x0080) * -1
 */
Buffer.prototype.readInt8 = function(offset, noAssert) {
  var buffer = this;
  var neg;

  if (!noAssert) {
    assert.ok(offset !== undefined && offset !== null,
        'missing offset');

    assert.ok(offset < buffer.length,
        'Trying to read beyond buffer length');
  }

  neg = buffer.parent[buffer.offset + offset] & 0x80;
  if (!neg) {
    return (buffer.parent[buffer.offset + offset]);
  }

  return ((0xff - buffer.parent[buffer.offset + offset] + 1) * -1);
};

function readInt16(buffer, offset, isBigEndian, noAssert) {
  var neg, val;

  if (!noAssert) {
    assert.ok(typeof (isBigEndian) === 'boolean',
        'missing or invalid endian');

    assert.ok(offset !== undefined && offset !== null,
        'missing offset');

    assert.ok(offset + 1 < buffer.length,
        'Trying to read beyond buffer length');
  }

  val = readUInt16(buffer, offset, isBigEndian, noAssert);
  neg = val & 0x8000;
  if (!neg) {
    return val;
  }

  return (0xffff - val + 1) * -1;
}

Buffer.prototype.readInt16LE = function(offset, noAssert) {
  return readInt16(this, offset, false, noAssert);
};

Buffer.prototype.readInt16BE = function(offset, noAssert) {
  return readInt16(this, offset, true, noAssert);
};

function readInt32(buffer, offset, isBigEndian, noAssert) {
  var neg, val;

  if (!noAssert) {
    assert.ok(typeof (isBigEndian) === 'boolean',
        'missing or invalid endian');

    assert.ok(offset !== undefined && offset !== null,
        'missing offset');

    assert.ok(offset + 3 < buffer.length,
        'Trying to read beyond buffer length');
  }

  val = readUInt32(buffer, offset, isBigEndian, noAssert);
  neg = val & 0x80000000;
  if (!neg) {
    return (val);
  }

  return (0xffffffff - val + 1) * -1;
}

Buffer.prototype.readInt32LE = function(offset, noAssert) {
  return readInt32(this, offset, false, noAssert);
};

Buffer.prototype.readInt32BE = function(offset, noAssert) {
  return readInt32(this, offset, true, noAssert);
};

function readFloat(buffer, offset, isBigEndian, noAssert) {
  if (!noAssert) {
    assert.ok(typeof (isBigEndian) === 'boolean',
        'missing or invalid endian');

    assert.ok(offset + 3 < buffer.length,
        'Trying to read beyond buffer length');
  }

  return require('./buffer_ieee754').readIEEE754(buffer, offset, isBigEndian,
      23, 4);
}

Buffer.prototype.readFloatLE = function(offset, noAssert) {
  return readFloat(this, offset, false, noAssert);
};

Buffer.prototype.readFloatBE = function(offset, noAssert) {
  return readFloat(this, offset, true, noAssert);
};

function readDouble(buffer, offset, isBigEndian, noAssert) {
  if (!noAssert) {
    assert.ok(typeof (isBigEndian) === 'boolean',
        'missing or invalid endian');

    assert.ok(offset + 7 < buffer.length,
        'Trying to read beyond buffer length');
  }

  return require('./buffer_ieee754').readIEEE754(buffer, offset, isBigEndian,
      52, 8);
}

Buffer.prototype.readDoubleLE = function(offset, noAssert) {
  return readDouble(this, offset, false, noAssert);
};

Buffer.prototype.readDoubleBE = function(offset, noAssert) {
  return readDouble(this, offset, true, noAssert);
};


/*
 * We have to make sure that the value is a valid integer. This means that it is
 * non-negative. It has no fractional component and that it does not exceed the
 * maximum allowed value.
 *
 *      value           The number to check for validity
 *
 *      max             The maximum value
 */
function verifuint(value, max) {
  assert.ok(typeof (value) == 'number',
      'cannot write a non-number as a number');

  assert.ok(value >= 0,
      'specified a negative value for writing an unsigned value');

  assert.ok(value <= max, 'value is larger than maximum value for type');

  assert.ok(Math.floor(value) === value, 'value has a fractional component');
}

Buffer.prototype.writeUInt8 = function(value, offset, noAssert) {
  var buffer = this;

  if (!noAssert) {
    assert.ok(value !== undefined && value !== null,
        'missing value');

    assert.ok(offset !== undefined && offset !== null,
        'missing offset');

    assert.ok(offset < buffer.length,
        'trying to write beyond buffer length');

    verifuint(value, 0xff);
  }

  buffer.parent[buffer.offset + offset] = value;
};

function writeUInt16(buffer, value, offset, isBigEndian, noAssert) {
  if (!noAssert) {
    assert.ok(value !== undefined && value !== null,
        'missing value');

    assert.ok(typeof (isBigEndian) === 'boolean',
        'missing or invalid endian');

    assert.ok(offset !== undefined && offset !== null,
        'missing offset');

    assert.ok(offset + 1 < buffer.length,
        'trying to write beyond buffer length');

    verifuint(value, 0xffff);
  }

  if (isBigEndian) {
    buffer.parent[buffer.offset + offset] = (value & 0xff00) >>> 8;
    buffer.parent[buffer.offset + offset + 1] = value & 0x00ff;
  } else {
    buffer.parent[buffer.offset + offset + 1] = (value & 0xff00) >>> 8;
    buffer.parent[buffer.offset + offset] = value & 0x00ff;
  }
}

Buffer.prototype.writeUInt16LE = function(value, offset, noAssert) {
  writeUInt16(this, value, offset, false, noAssert);
};

Buffer.prototype.writeUInt16BE = function(value, offset, noAssert) {
  writeUInt16(this, value, offset, true, noAssert);
};

function writeUInt32(buffer, value, offset, isBigEndian, noAssert) {
  if (!noAssert) {
    assert.ok(value !== undefined && value !== null,
        'missing value');

    assert.ok(typeof (isBigEndian) === 'boolean',
        'missing or invalid endian');

    assert.ok(offset !== undefined && offset !== null,
        'missing offset');

    assert.ok(offset + 3 < buffer.length,
        'trying to write beyond buffer length');

    verifuint(value, 0xffffffff);
  }

  if (isBigEndian) {
    buffer.parent[buffer.offset + offset] = (value >>> 24) & 0xff;
    buffer.parent[buffer.offset + offset + 1] = (value >>> 16) & 0xff;
    buffer.parent[buffer.offset + offset + 2] = (value >>> 8) & 0xff;
    buffer.parent[buffer.offset + offset + 3] = value & 0xff;
  } else {
    buffer.parent[buffer.offset + offset + 3] = (value >>> 24) & 0xff;
    buffer.parent[buffer.offset + offset + 2] = (value >>> 16) & 0xff;
    buffer.parent[buffer.offset + offset + 1] = (value >>> 8) & 0xff;
    buffer.parent[buffer.offset + offset] = value & 0xff;
  }
}

Buffer.prototype.writeUInt32LE = function(value, offset, noAssert) {
  writeUInt32(this, value, offset, false, noAssert);
};

Buffer.prototype.writeUInt32BE = function(value, offset, noAssert) {
  writeUInt32(this, value, offset, true, noAssert);
};


/*
 * We now move onto our friends in the signed number category. Unlike unsigned
 * numbers, we're going to have to worry a bit more about how we put values into
 * arrays. Since we are only worrying about signed 32-bit values, we're in
 * slightly better shape. Unfortunately, we really can't do our favorite binary
 * & in this system. It really seems to do the wrong thing. For example:
 *
 * > -32 & 0xff
 * 224
 *
 * What's happening above is really: 0xe0 & 0xff = 0xe0. However, the results of
 * this aren't treated as a signed number. Ultimately a bad thing.
 *
 * What we're going to want to do is basically create the unsigned equivalent of
 * our representation and pass that off to the wuint* functions. To do that
 * we're going to do the following:
 *
 *  - if the value is positive
 *      we can pass it directly off to the equivalent wuint
 *  - if the value is negative
 *      we do the following computation:
 *         mb + val + 1, where
 *         mb   is the maximum unsigned value in that byte size
 *         val  is the Javascript negative integer
 *
 *
 * As a concrete value, take -128. In signed 16 bits this would be 0xff80. If
 * you do out the computations:
 *
 * 0xffff - 128 + 1
 * 0xffff - 127
 * 0xff80
 *
 * You can then encode this value as the signed version. This is really rather
 * hacky, but it should work and get the job done which is our goal here.
 */

/*
 * A series of checks to make sure we actually have a signed 32-bit number
 */
function verifsint(value, max, min) {
  assert.ok(typeof (value) == 'number',
      'cannot write a non-number as a number');

  assert.ok(value <= max, 'value larger than maximum allowed value');

  assert.ok(value >= min, 'value smaller than minimum allowed value');

  assert.ok(Math.floor(value) === value, 'value has a fractional component');
}

function verifIEEE754(value, max, min) {
  assert.ok(typeof (value) == 'number',
      'cannot write a non-number as a number');

  assert.ok(value <= max, 'value larger than maximum allowed value');

  assert.ok(value >= min, 'value smaller than minimum allowed value');
}

Buffer.prototype.writeInt8 = function(value, offset, noAssert) {
  var buffer = this;

  if (!noAssert) {
    assert.ok(value !== undefined && value !== null,
        'missing value');

    assert.ok(offset !== undefined && offset !== null,
        'missing offset');

    assert.ok(offset < buffer.length,
        'Trying to write beyond buffer length');

    verifsint(value, 0x7f, -0x80);
  }

  if (value >= 0) {
    buffer.writeUInt8(value, offset, noAssert);
  } else {
    buffer.writeUInt8(0xff + value + 1, offset, noAssert);
  }
};

function writeInt16(buffer, value, offset, isBigEndian, noAssert) {
  if (!noAssert) {
    assert.ok(value !== undefined && value !== null,
        'missing value');

    assert.ok(typeof (isBigEndian) === 'boolean',
        'missing or invalid endian');

    assert.ok(offset !== undefined && offset !== null,
        'missing offset');

    assert.ok(offset + 1 < buffer.length,
        'Trying to write beyond buffer length');

    verifsint(value, 0x7fff, -0x8000);
  }

  if (value >= 0) {
    writeUInt16(buffer, value, offset, isBigEndian, noAssert);
  } else {
    writeUInt16(buffer, 0xffff + value + 1, offset, isBigEndian, noAssert);
  }
}

Buffer.prototype.writeInt16LE = function(value, offset, noAssert) {
  writeInt16(this, value, offset, false, noAssert);
};

Buffer.prototype.writeInt16BE = function(value, offset, noAssert) {
  writeInt16(this, value, offset, true, noAssert);
};

function writeInt32(buffer, value, offset, isBigEndian, noAssert) {
  if (!noAssert) {
    assert.ok(value !== undefined && value !== null,
        'missing value');

    assert.ok(typeof (isBigEndian) === 'boolean',
        'missing or invalid endian');

    assert.ok(offset !== undefined && offset !== null,
        'missing offset');

    assert.ok(offset + 3 < buffer.length,
        'Trying to write beyond buffer length');

    verifsint(value, 0x7fffffff, -0x80000000);
  }

  if (value >= 0) {
    writeUInt32(buffer, value, offset, isBigEndian, noAssert);
  } else {
    writeUInt32(buffer, 0xffffffff + value + 1, offset, isBigEndian, noAssert);
  }
}

Buffer.prototype.writeInt32LE = function(value, offset, noAssert) {
  writeInt32(this, value, offset, false, noAssert);
};

Buffer.prototype.writeInt32BE = function(value, offset, noAssert) {
  writeInt32(this, value, offset, true, noAssert);
};

function writeFloat(buffer, value, offset, isBigEndian, noAssert) {
  if (!noAssert) {
    assert.ok(value !== undefined && value !== null,
        'missing value');

    assert.ok(typeof (isBigEndian) === 'boolean',
        'missing or invalid endian');

    assert.ok(offset !== undefined && offset !== null,
        'missing offset');

    assert.ok(offset + 3 < buffer.length,
        'Trying to write beyond buffer length');

    verifIEEE754(value, 3.4028234663852886e+38, -3.4028234663852886e+38);
  }

  require('./buffer_ieee754').writeIEEE754(buffer, value, offset, isBigEndian,
      23, 4);
}

Buffer.prototype.writeFloatLE = function(value, offset, noAssert) {
  writeFloat(this, value, offset, false, noAssert);
};

Buffer.prototype.writeFloatBE = function(value, offset, noAssert) {
  writeFloat(this, value, offset, true, noAssert);
};

function writeDouble(buffer, value, offset, isBigEndian, noAssert) {
  if (!noAssert) {
    assert.ok(value !== undefined && value !== null,
        'missing value');

    assert.ok(typeof (isBigEndian) === 'boolean',
        'missing or invalid endian');

    assert.ok(offset !== undefined && offset !== null,
        'missing offset');

    assert.ok(offset + 7 < buffer.length,
        'Trying to write beyond buffer length');

    verifIEEE754(value, 1.7976931348623157E+308, -1.7976931348623157E+308);
  }

  require('./buffer_ieee754').writeIEEE754(buffer, value, offset, isBigEndian,
      52, 8);
}

Buffer.prototype.writeDoubleLE = function(value, offset, noAssert) {
  writeDouble(this, value, offset, false, noAssert);
};

Buffer.prototype.writeDoubleBE = function(value, offset, noAssert) {
  writeDouble(this, value, offset, true, noAssert);
};

SlowBuffer.prototype.readUInt8 = Buffer.prototype.readUInt8;
SlowBuffer.prototype.readUInt16LE = Buffer.prototype.readUInt16LE;
SlowBuffer.prototype.readUInt16BE = Buffer.prototype.readUInt16BE;
SlowBuffer.prototype.readUInt32LE = Buffer.prototype.readUInt32LE;
SlowBuffer.prototype.readUInt32BE = Buffer.prototype.readUInt32BE;
SlowBuffer.prototype.readInt8 = Buffer.prototype.readInt8;
SlowBuffer.prototype.readInt16LE = Buffer.prototype.readInt16LE;
SlowBuffer.prototype.readInt16BE = Buffer.prototype.readInt16BE;
SlowBuffer.prototype.readInt32LE = Buffer.prototype.readInt32LE;
SlowBuffer.prototype.readInt32BE = Buffer.prototype.readInt32BE;
SlowBuffer.prototype.readFloatLE = Buffer.prototype.readFloatLE;
SlowBuffer.prototype.readFloatBE = Buffer.prototype.readFloatBE;
SlowBuffer.prototype.readDoubleLE = Buffer.prototype.readDoubleLE;
SlowBuffer.prototype.readDoubleBE = Buffer.prototype.readDoubleBE;
SlowBuffer.prototype.writeUInt8 = Buffer.prototype.writeUInt8;
SlowBuffer.prototype.writeUInt16LE = Buffer.prototype.writeUInt16LE;
SlowBuffer.prototype.writeUInt16BE = Buffer.prototype.writeUInt16BE;
SlowBuffer.prototype.writeUInt32LE = Buffer.prototype.writeUInt32LE;
SlowBuffer.prototype.writeUInt32BE = Buffer.prototype.writeUInt32BE;
SlowBuffer.prototype.writeInt8 = Buffer.prototype.writeInt8;
SlowBuffer.prototype.writeInt16LE = Buffer.prototype.writeInt16LE;
SlowBuffer.prototype.writeInt16BE = Buffer.prototype.writeInt16BE;
SlowBuffer.prototype.writeInt32LE = Buffer.prototype.writeInt32LE;
SlowBuffer.prototype.writeInt32BE = Buffer.prototype.writeInt32BE;
SlowBuffer.prototype.writeFloatLE = Buffer.prototype.writeFloatLE;
SlowBuffer.prototype.writeFloatBE = Buffer.prototype.writeFloatBE;
SlowBuffer.prototype.writeDoubleLE = Buffer.prototype.writeDoubleLE;
SlowBuffer.prototype.writeDoubleBE = Buffer.prototype.writeDoubleBE;

})()
},{"assert":2,"./buffer_ieee754":7,"base64-js":9}],9:[function(require,module,exports){
(function (exports) {
	'use strict';

	var lookup = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

	function b64ToByteArray(b64) {
		var i, j, l, tmp, placeHolders, arr;
	
		if (b64.length % 4 > 0) {
			throw 'Invalid string. Length must be a multiple of 4';
		}

		// the number of equal signs (place holders)
		// if there are two placeholders, than the two characters before it
		// represent one byte
		// if there is only one, then the three characters before it represent 2 bytes
		// this is just a cheap hack to not do indexOf twice
		placeHolders = b64.indexOf('=');
		placeHolders = placeHolders > 0 ? b64.length - placeHolders : 0;

		// base64 is 4/3 + up to two characters of the original data
		arr = [];//new Uint8Array(b64.length * 3 / 4 - placeHolders);

		// if there are placeholders, only get up to the last complete 4 chars
		l = placeHolders > 0 ? b64.length - 4 : b64.length;

		for (i = 0, j = 0; i < l; i += 4, j += 3) {
			tmp = (lookup.indexOf(b64[i]) << 18) | (lookup.indexOf(b64[i + 1]) << 12) | (lookup.indexOf(b64[i + 2]) << 6) | lookup.indexOf(b64[i + 3]);
			arr.push((tmp & 0xFF0000) >> 16);
			arr.push((tmp & 0xFF00) >> 8);
			arr.push(tmp & 0xFF);
		}

		if (placeHolders === 2) {
			tmp = (lookup.indexOf(b64[i]) << 2) | (lookup.indexOf(b64[i + 1]) >> 4);
			arr.push(tmp & 0xFF);
		} else if (placeHolders === 1) {
			tmp = (lookup.indexOf(b64[i]) << 10) | (lookup.indexOf(b64[i + 1]) << 4) | (lookup.indexOf(b64[i + 2]) >> 2);
			arr.push((tmp >> 8) & 0xFF);
			arr.push(tmp & 0xFF);
		}

		return arr;
	}

	function uint8ToBase64(uint8) {
		var i,
			extraBytes = uint8.length % 3, // if we have 1 byte left, pad 2 bytes
			output = "",
			temp, length;

		function tripletToBase64 (num) {
			return lookup[num >> 18 & 0x3F] + lookup[num >> 12 & 0x3F] + lookup[num >> 6 & 0x3F] + lookup[num & 0x3F];
		};

		// go through the array every three bytes, we'll deal with trailing stuff later
		for (i = 0, length = uint8.length - extraBytes; i < length; i += 3) {
			temp = (uint8[i] << 16) + (uint8[i + 1] << 8) + (uint8[i + 2]);
			output += tripletToBase64(temp);
		}

		// pad the end with zeros, but make sure to not forget the extra bytes
		switch (extraBytes) {
			case 1:
				temp = uint8[uint8.length - 1];
				output += lookup[temp >> 2];
				output += lookup[(temp << 4) & 0x3F];
				output += '==';
				break;
			case 2:
				temp = (uint8[uint8.length - 2] << 8) + (uint8[uint8.length - 1]);
				output += lookup[temp >> 10];
				output += lookup[(temp >> 4) & 0x3F];
				output += lookup[(temp << 2) & 0x3F];
				output += '=';
				break;
		}

		return output;
	}

	module.exports.toByteArray = b64ToByteArray;
	module.exports.fromByteArray = uint8ToBase64;
}());

},{}]},{},[])
;;module.exports=require("buffer-browserify")

},{}],4:[function(require,module,exports){
(function(Buffer){(function () {
  "use strict";

  function btoa(str) {
    var buffer
      ;

    if (str instanceof Buffer) {
      buffer = str;
    } else {
      buffer = new Buffer(str.toString(), 'binary');
    }

    return buffer.toString('base64');
  }

  module.exports = btoa;
}());

})(require("__browserify_buffer").Buffer)
},{"__browserify_buffer":5}],3:[function(require,module,exports){
var defs = require('./definitions.json')

module.exports = function(r) {
  return parse(r);
}

var parsers = {
  'float': function(v) {return parseFloat(v.value);},
  'integer': function(v) {return parseInt(v.value);},
  'date': function(v) {return new Date(v.value);},
  'string': function(v) {return (typeof v === 'string' ? v : v.value.toString());},
  'boolean': function(v) {return v.value.toString() === "true";}
};

function parse(r, path) {

  if (Array.isArray(r)){
    return r.map(function(e){
      return parse(e, path);
    });
  }

  if (typeof r !== 'object') {
    return r;
  }

  if (path === undefined || (path[0] == 'Resource')) {
    if (Object.keys(r).length  !== 1) {
      throw "Can't treat r as FHIR object: <> 1 key: " + r;
    }
    var resourceType = Object.keys(r)[0];
    var ret = parse(r[resourceType], [resourceType]);
    ret.resourceType = resourceType;
    return ret;
  }
  var context = defs[path.join(".")];
  var ret = {};
  Object.keys(r).forEach(function(k){
    var p = context && context.edges[k]
    if(p && parsers[p.parser]) {
      ret[k] = parsers[p.parser](r[k])
    } else {
      var nextContext = [k];
      if (p && p.next) {nextContext = p.next.split(".");}
      ret[k] = parse(r[k], nextContext);
    }
  });
  return ret
}

},{"./definitions.json":6}],6:[function(require,module,exports){
module.exports={
  "Address": {
    "edges": {
      "city": {
        "parser": "string"
      }, 
      "country": {
        "parser": "string"
      }, 
      "line": {
        "parser": "string"
      }, 
      "period": {
        "next": "Period"
      }, 
      "state": {
        "parser": "string"
      }, 
      "text": {
        "parser": "string"
      }, 
      "use": {
        "parser": "string"
      }, 
      "zip": {
        "parser": "string"
      }
    }
  }, 
  "AdverseReaction": {
    "edges": {
      "contained": {
        "next": "Resource"
      }, 
      "didNotOccurFlag": {
        "parser": "boolean"
      }, 
      "exposure": {
        "next": "AdverseReaction.exposure"
      }, 
      "extension": {
        "next": "Extension"
      }, 
      "reactionDate": {
        "parser": "date"
      }, 
      "recorder": {
        "next": "ResourceReference"
      }, 
      "subject": {
        "next": "ResourceReference"
      }, 
      "symptom": {
        "next": "AdverseReaction.symptom"
      }, 
      "text": {
        "next": "Narrative"
      }
    }
  }, 
  "AdverseReaction.exposure": {
    "edges": {
      "causalityExpectation": {
        "parser": "string"
      }, 
      "exposureDate": {
        "parser": "date"
      }, 
      "exposureType": {
        "parser": "string"
      }, 
      "substance": {
        "next": "ResourceReference"
      }
    }
  }, 
  "AdverseReaction.symptom": {
    "edges": {
      "code": {
        "next": "CodeableConcept"
      }, 
      "severity": {
        "parser": "string"
      }
    }
  }, 
  "Alert": {
    "edges": {
      "author": {
        "next": "ResourceReference"
      }, 
      "category": {
        "next": "CodeableConcept"
      }, 
      "contained": {
        "next": "Resource"
      }, 
      "extension": {
        "next": "Extension"
      }, 
      "note": {
        "parser": "string"
      }, 
      "status": {
        "parser": "string"
      }, 
      "subject": {
        "next": "ResourceReference"
      }, 
      "text": {
        "next": "Narrative"
      }
    }
  }, 
  "AllergyIntolerance": {
    "edges": {
      "contained": {
        "next": "Resource"
      }, 
      "criticality": {
        "parser": "string"
      }, 
      "extension": {
        "next": "Extension"
      }, 
      "identifier": {
        "next": "Identifier"
      }, 
      "reaction": {
        "next": "ResourceReference"
      }, 
      "recordedDate": {
        "parser": "date"
      }, 
      "recorder": {
        "next": "ResourceReference"
      }, 
      "sensitivityTest": {
        "next": "ResourceReference"
      }, 
      "sensitivityType": {
        "parser": "string"
      }, 
      "status": {
        "parser": "string"
      }, 
      "subject": {
        "next": "ResourceReference"
      }, 
      "substance": {
        "next": "ResourceReference"
      }, 
      "text": {
        "next": "Narrative"
      }
    }
  }, 
  "Attachment": {
    "edges": {
      "contentType": {
        "parser": "string"
      }, 
      "data": {
        "parser": "string"
      }, 
      "hash": {
        "parser": "string"
      }, 
      "language": {
        "parser": "string"
      }, 
      "size": {
        "parser": "integer"
      }, 
      "title": {
        "parser": "string"
      }, 
      "url": {
        "parser": "string"
      }
    }
  }, 
  "CarePlan": {
    "edges": {
      "activity": {
        "next": "CarePlan.activity"
      }, 
      "concern": {
        "next": "ResourceReference"
      }, 
      "contained": {
        "next": "Resource"
      }, 
      "extension": {
        "next": "Extension"
      }, 
      "goal": {
        "next": "CarePlan.goal"
      }, 
      "identifier": {
        "next": "Identifier"
      }, 
      "modified": {
        "parser": "date"
      }, 
      "notes": {
        "parser": "string"
      }, 
      "participant": {
        "next": "CarePlan.participant"
      }, 
      "patient": {
        "next": "ResourceReference"
      }, 
      "period": {
        "next": "Period"
      }, 
      "status": {
        "parser": "string"
      }, 
      "text": {
        "next": "Narrative"
      }
    }
  }, 
  "CarePlan.activity": {
    "edges": {
      "actionTaken": {
        "next": "ResourceReference"
      }, 
      "category": {
        "parser": "string"
      }, 
      "code": {
        "next": "CodeableConcept"
      }, 
      "dailyAmount": {
        "next": "Quantity"
      }, 
      "details": {
        "parser": "string"
      }, 
      "location": {
        "next": "ResourceReference"
      }, 
      "notes": {
        "parser": "string"
      }, 
      "performer": {
        "next": "ResourceReference"
      }, 
      "product": {
        "next": "ResourceReference"
      }, 
      "prohibited": {
        "parser": "boolean"
      }, 
      "quantity": {
        "next": "Quantity"
      }, 
      "status": {
        "parser": "string"
      }, 
      "timingPeriod": {
        "next": "Period"
      }, 
      "timingSchedule": {
        "next": "Schedule"
      }, 
      "timingstring": {
        "parser": "string"
      }
    }
  }, 
  "CarePlan.goal": {
    "edges": {
      "description": {
        "parser": "string"
      }, 
      "notes": {
        "parser": "string"
      }, 
      "status": {
        "parser": "string"
      }
    }
  }, 
  "CarePlan.participant": {
    "edges": {
      "member": {
        "next": "ResourceReference"
      }, 
      "role": {
        "next": "CodeableConcept"
      }
    }
  }, 
  "Choice": {
    "edges": {
      "code": {
        "parser": "string"
      }, 
      "isOrdered": {
        "parser": "boolean"
      }, 
      "option": {
        "next": "Choice.option"
      }
    }
  }, 
  "Choice.option": {
    "edges": {
      "code": {
        "parser": "string"
      }, 
      "display": {
        "parser": "string"
      }
    }
  }, 
  "CodeableConcept": {
    "edges": {
      "coding": {
        "next": "Coding"
      }, 
      "primary": {
        "parser": "string"
      }, 
      "text": {
        "parser": "string"
      }
    }
  }, 
  "Coding": {
    "edges": {
      "code": {
        "parser": "string"
      }, 
      "display": {
        "parser": "string"
      }, 
      "system": {
        "parser": "string"
      }
    }
  }, 
  "Condition": {
    "edges": {
      "abatementAge": {
        "next": "Age"
      }, 
      "abatementboolean": {
        "parser": "boolean"
      }, 
      "abatementdate": {
        "next": "date"
      }, 
      "asserter": {
        "next": "ResourceReference"
      }, 
      "category": {
        "next": "CodeableConcept"
      }, 
      "certainty": {
        "next": "CodeableConcept"
      }, 
      "code": {
        "next": "CodeableConcept"
      }, 
      "contained": {
        "next": "Resource"
      }, 
      "dateAsserted": {
        "next": "date"
      }, 
      "encounter": {
        "next": "ResourceReference"
      }, 
      "evidence": {
        "next": "Condition.evidence"
      }, 
      "extension": {
        "next": "Extension"
      }, 
      "location": {
        "next": "Condition.location"
      }, 
      "notes": {
        "parser": "string"
      }, 
      "onsetAge": {
        "next": "Age"
      }, 
      "onsetdate": {
        "next": "date"
      }, 
      "relatedItem": {
        "next": "Condition.relatedItem"
      }, 
      "severity": {
        "next": "CodeableConcept"
      }, 
      "stage": {
        "next": "Condition.stage"
      }, 
      "status": {
        "parser": "string"
      }, 
      "subject": {
        "next": "ResourceReference"
      }, 
      "text": {
        "next": "Narrative"
      }
    }
  }, 
  "Condition.evidence": {
    "edges": {
      "code": {
        "next": "CodeableConcept"
      }, 
      "detail": {
        "next": "ResourceReference"
      }
    }
  }, 
  "Condition.location": {
    "edges": {
      "code": {
        "next": "CodeableConcept"
      }, 
      "detail": {
        "parser": "string"
      }
    }
  }, 
  "Condition.relatedItem": {
    "edges": {
      "code": {
        "next": "CodeableConcept"
      }, 
      "target": {
        "next": "ResourceReference"
      }, 
      "type": {
        "parser": "string"
      }
    }
  }, 
  "Condition.stage": {
    "edges": {
      "assessment": {
        "next": "ResourceReference"
      }, 
      "summary": {
        "next": "CodeableConcept"
      }
    }
  }, 
  "Conformance": {
    "edges": {
      "acceptUnknown": {
        "parser": "boolean"
      }, 
      "contained": {
        "next": "Resource"
      }, 
      "date": {
        "parser": "date"
      }, 
      "description": {
        "parser": "string"
      }, 
      "document": {
        "next": "Conformance.document"
      }, 
      "experimental": {
        "parser": "boolean"
      }, 
      "extension": {
        "next": "Extension"
      }, 
      "fhirVersion": {
        "parser": "string"
      }, 
      "format": {
        "parser": "string"
      }, 
      "identifier": {
        "parser": "string"
      }, 
      "implementation": {
        "next": "Conformance.implementation"
      }, 
      "messaging": {
        "next": "Conformance.messaging"
      }, 
      "name": {
        "parser": "string"
      }, 
      "publisher": {
        "parser": "string"
      }, 
      "rest": {
        "next": "Conformance.rest"
      }, 
      "software": {
        "next": "Conformance.software"
      }, 
      "status": {
        "parser": "string"
      }, 
      "telecom": {
        "next": "Contact"
      }, 
      "text": {
        "next": "Narrative"
      }, 
      "version": {
        "parser": "string"
      }
    }
  }, 
  "Conformance.document": {
    "edges": {
      "documentation": {
        "parser": "string"
      }, 
      "mode": {
        "parser": "string"
      }, 
      "profile": {
        "next": "ResourceReference"
      }
    }
  }, 
  "Conformance.implementation": {
    "edges": {
      "description": {
        "parser": "string"
      }, 
      "url": {
        "parser": "string"
      }
    }
  }, 
  "Conformance.messaging": {
    "edges": {
      "documentation": {
        "parser": "string"
      }, 
      "endpoint": {
        "parser": "string"
      }, 
      "event": {
        "next": "Conformance.messaging.event"
      }, 
      "reliableCache": {
        "parser": "integer"
      }
    }
  }, 
  "Conformance.messaging.event": {
    "edges": {
      "code": {
        "parser": "string"
      }, 
      "documentation": {
        "parser": "string"
      }, 
      "focus": {
        "parser": "string"
      }, 
      "mode": {
        "parser": "string"
      }, 
      "protocol": {
        "next": "Coding"
      }, 
      "request": {
        "next": "ResourceReference"
      }, 
      "response": {
        "next": "ResourceReference"
      }
    }
  }, 
  "Conformance.rest": {
    "edges": {
      "batch": {
        "parser": "boolean"
      }, 
      "documentation": {
        "parser": "string"
      }, 
      "history": {
        "parser": "boolean"
      }, 
      "mode": {
        "parser": "string"
      }, 
      "query": {
        "next": "Conformance.rest.query"
      }, 
      "resource": {
        "next": "Conformance.rest.resource"
      }, 
      "security": {
        "next": "Conformance.rest.security"
      }
    }
  }, 
  "Conformance.rest.query": {
    "edges": {
      "documentation": {
        "parser": "string"
      }, 
      "name": {
        "parser": "string"
      }, 
      "parameter": {
        "next": "Conformance.rest.resource.searchParam"
      }
    }
  }, 
  "Conformance.rest.resource": {
    "edges": {
      "operation": {
        "next": "Conformance.rest.resource.operation"
      }, 
      "profile": {
        "next": "ResourceReference"
      }, 
      "readHistory": {
        "parser": "boolean"
      }, 
      "searchInclude": {
        "parser": "string"
      }, 
      "searchParam": {
        "next": "Conformance.rest.resource.searchParam"
      }, 
      "type": {
        "parser": "string"
      }
    }
  }, 
  "Conformance.rest.resource.operation": {
    "edges": {
      "code": {
        "parser": "string"
      }, 
      "documentation": {
        "parser": "string"
      }
    }
  }, 
  "Conformance.rest.resource.searchParam": {
    "edges": {
      "chain": {
        "parser": "string"
      }, 
      "documentation": {
        "parser": "string"
      }, 
      "name": {
        "parser": "string"
      }, 
      "source": {
        "parser": "string"
      }, 
      "target": {
        "parser": "string"
      }, 
      "type": {
        "parser": "string"
      }, 
      "xpath": {
        "parser": "string"
      }
    }
  }, 
  "Conformance.rest.security": {
    "edges": {
      "certificate": {
        "next": "Conformance.rest.security.certificate"
      }, 
      "description": {
        "parser": "string"
      }, 
      "service": {
        "next": "CodeableConcept"
      }
    }
  }, 
  "Conformance.rest.security.certificate": {
    "edges": {
      "blob": {
        "parser": "string"
      }, 
      "type": {
        "parser": "string"
      }
    }
  }, 
  "Conformance.software": {
    "edges": {
      "name": {
        "parser": "string"
      }, 
      "releaseDate": {
        "parser": "date"
      }, 
      "version": {
        "parser": "string"
      }
    }
  }, 
  "Contact": {
    "edges": {
      "period": {
        "next": "Period"
      }, 
      "system": {
        "parser": "string"
      }, 
      "use": {
        "parser": "string"
      }, 
      "value": {
        "parser": "string"
      }
    }
  }, 
  "Coverage": {
    "edges": {
      "contained": {
        "next": "Resource"
      }, 
      "dependent": {
        "parser": "integer"
      }, 
      "extension": {
        "next": "Extension"
      }, 
      "group": {
        "next": "Identifier"
      }, 
      "identifier": {
        "next": "Identifier"
      }, 
      "issuer": {
        "next": "ResourceReference"
      }, 
      "period": {
        "next": "Period"
      }, 
      "plan": {
        "next": "Identifier"
      }, 
      "sequence": {
        "parser": "integer"
      }, 
      "subplan": {
        "next": "Identifier"
      }, 
      "subscriber": {
        "next": "Coverage.subscriber"
      }, 
      "text": {
        "next": "Narrative"
      }, 
      "type": {
        "next": "Coding"
      }
    }
  }, 
  "Coverage.subscriber": {
    "edges": {
      "address": {
        "next": "Address"
      }, 
      "birthdate": {
        "next": "date"
      }, 
      "name": {
        "next": "HumanName"
      }
    }
  }, 
  "Device": {
    "edges": {
      "assignedId": {
        "next": "Identifier"
      }, 
      "contact": {
        "next": "Contact"
      }, 
      "contained": {
        "next": "Resource"
      }, 
      "expiry": {
        "next": "date"
      }, 
      "extension": {
        "next": "Extension"
      }, 
      "identity": {
        "next": "Device.identity"
      }, 
      "location": {
        "next": "ResourceReference"
      }, 
      "manufacturer": {
        "parser": "string"
      }, 
      "model": {
        "parser": "string"
      }, 
      "owner": {
        "next": "ResourceReference"
      }, 
      "patient": {
        "next": "ResourceReference"
      }, 
      "text": {
        "next": "Narrative"
      }, 
      "type": {
        "next": "CodeableConcept"
      }, 
      "url": {
        "parser": "string"
      }, 
      "version": {
        "parser": "string"
      }
    }
  }, 
  "Device.identity": {
    "edges": {
      "gtin": {
        "parser": "string"
      }, 
      "lot": {
        "parser": "string"
      }, 
      "serialNumber": {
        "parser": "string"
      }
    }
  }, 
  "DeviceCapabilities": {
    "edges": {
      "contained": {
        "next": "Resource"
      }, 
      "extension": {
        "next": "Extension"
      }, 
      "identity": {
        "next": "ResourceReference"
      }, 
      "manufacturer": {
        "parser": "string"
      }, 
      "name": {
        "parser": "string"
      }, 
      "text": {
        "next": "Narrative"
      }, 
      "type": {
        "next": "CodeableConcept"
      }, 
      "virtualDevice": {
        "next": "DeviceCapabilities.virtualDevice"
      }
    }
  }, 
  "DeviceCapabilities.virtualDevice": {
    "edges": {
      "channel": {
        "next": "DeviceCapabilities.virtualDevice.channel"
      }, 
      "code": {
        "next": "CodeableConcept"
      }
    }
  }, 
  "DeviceCapabilities.virtualDevice.channel": {
    "edges": {
      "code": {
        "next": "CodeableConcept"
      }, 
      "metric": {
        "next": "DeviceCapabilities.virtualDevice.channel.metric"
      }
    }
  }, 
  "DeviceCapabilities.virtualDevice.channel.metric": {
    "edges": {
      "code": {
        "next": "CodeableConcept"
      }, 
      "facet": {
        "next": "DeviceCapabilities.virtualDevice.channel.metric.facet"
      }, 
      "info": {
        "next": "DeviceCapabilities.virtualDevice.channel.metric.info"
      }, 
      "key": {
        "parser": "string"
      }
    }
  }, 
  "DeviceCapabilities.virtualDevice.channel.metric.facet": {
    "edges": {
      "code": {
        "next": "CodeableConcept"
      }, 
      "info": {
        "next": "DeviceCapabilities.virtualDevice.channel.metric.info"
      }, 
      "key": {
        "parser": "string"
      }, 
      "scale": {
        "parser": "float"
      }
    }
  }, 
  "DeviceCapabilities.virtualDevice.channel.metric.info": {
    "edges": {
      "system": {
        "parser": "string"
      }, 
      "template": {
        "next": "SampledData"
      }, 
      "type": {
        "parser": "string"
      }, 
      "ucum": {
        "parser": "string"
      }, 
      "units": {
        "parser": "string"
      }
    }
  }, 
  "DeviceLog": {
    "edges": {
      "capabilities": {
        "next": "ResourceReference"
      }, 
      "contained": {
        "next": "Resource"
      }, 
      "extension": {
        "next": "Extension"
      }, 
      "instant": {
        "parser": "date"
      }, 
      "item": {
        "next": "DeviceLog.item"
      }, 
      "subject": {
        "next": "ResourceReference"
      }, 
      "text": {
        "next": "Narrative"
      }
    }
  }, 
  "DeviceLog.item": {
    "edges": {
      "flag": {
        "parser": "string"
      }, 
      "key": {
        "parser": "string"
      }, 
      "value": {
        "parser": "string"
      }
    }
  }, 
  "DeviceObservation": {
    "edges": {
      "code": {
        "next": "CodeableConcept"
      }, 
      "contained": {
        "next": "Resource"
      }, 
      "device": {
        "next": "ResourceReference"
      }, 
      "extension": {
        "next": "Extension"
      }, 
      "identifier": {
        "next": "Identifier"
      }, 
      "issued": {
        "parser": "date"
      }, 
      "measurement": {
        "next": "ResourceReference"
      }, 
      "subject": {
        "next": "ResourceReference"
      }, 
      "text": {
        "next": "Narrative"
      }
    }
  }, 
  "DiagnosticOrder": {
    "edges": {
      "clinicalNotes": {
        "parser": "string"
      }, 
      "contained": {
        "next": "Resource"
      }, 
      "encounter": {
        "next": "ResourceReference"
      }, 
      "event": {
        "next": "DiagnosticOrder.event"
      }, 
      "extension": {
        "next": "Extension"
      }, 
      "identifier": {
        "next": "Identifier"
      }, 
      "item": {
        "next": "DiagnosticOrder.item"
      }, 
      "orderer": {
        "next": "ResourceReference"
      }, 
      "priority": {
        "parser": "string"
      }, 
      "specimen": {
        "next": "ResourceReference"
      }, 
      "status": {
        "parser": "string"
      }, 
      "subject": {
        "next": "ResourceReference"
      }, 
      "text": {
        "next": "Narrative"
      }
    }
  }, 
  "DiagnosticOrder.event": {
    "edges": {
      "actor": {
        "next": "ResourceReference"
      }, 
      "date": {
        "parser": "date"
      }, 
      "status": {
        "parser": "string"
      }
    }
  }, 
  "DiagnosticOrder.item": {
    "edges": {
      "bodySite": {
        "next": "CodeableConcept"
      }, 
      "code": {
        "next": "CodeableConcept"
      }, 
      "event": {
        "next": "DiagnosticOrder.event"
      }, 
      "specimen": {
        "next": "ResourceReference"
      }, 
      "status": {
        "parser": "string"
      }
    }
  }, 
  "DiagnosticReport": {
    "edges": {
      "codedDiagnosis": {
        "next": "CodeableConcept"
      }, 
      "conclusion": {
        "parser": "string"
      }, 
      "contained": {
        "next": "Resource"
      }, 
      "diagnosticTime": {
        "parser": "date"
      }, 
      "extension": {
        "next": "Extension"
      }, 
      "image": {
        "next": "ResourceReference"
      }, 
      "issued": {
        "parser": "date"
      }, 
      "performer": {
        "next": "ResourceReference"
      }, 
      "reportId": {
        "next": "Identifier"
      }, 
      "representation": {
        "next": "Attachment"
      }, 
      "requestDetail": {
        "next": "DiagnosticReport.requestDetail"
      }, 
      "results": {
        "next": "DiagnosticReport.results"
      }, 
      "serviceCategory": {
        "next": "CodeableConcept"
      }, 
      "status": {
        "parser": "string"
      }, 
      "subject": {
        "next": "ResourceReference"
      }, 
      "text": {
        "next": "Narrative"
      }
    }
  }, 
  "DiagnosticReport.requestDetail": {
    "edges": {
      "bodySite": {
        "next": "CodeableConcept"
      }, 
      "clinicalInfo": {
        "parser": "string"
      }, 
      "encounter": {
        "next": "ResourceReference"
      }, 
      "receiverOrderId": {
        "next": "Identifier"
      }, 
      "requestOrderId": {
        "next": "Identifier"
      }, 
      "requestTest": {
        "next": "CodeableConcept"
      }, 
      "requester": {
        "next": "ResourceReference"
      }
    }
  }, 
  "DiagnosticReport.results": {
    "edges": {
      "group": {
        "next": "DiagnosticReport.results"
      }, 
      "name": {
        "next": "CodeableConcept"
      }, 
      "result": {
        "next": "ResourceReference"
      }, 
      "specimen": {
        "next": "ResourceReference"
      }
    }
  }, 
  "Document": {
    "edges": {
      "attester": {
        "next": "Document.attester"
      }, 
      "author": {
        "next": "ResourceReference"
      }, 
      "confidentiality": {
        "next": "Coding"
      }, 
      "contained": {
        "next": "Resource"
      }, 
      "created": {
        "parser": "date"
      }, 
      "custodian": {
        "next": "ResourceReference"
      }, 
      "encounter": {
        "next": "ResourceReference"
      }, 
      "event": {
        "next": "Document.event"
      }, 
      "extension": {
        "next": "Extension"
      }, 
      "identifier": {
        "next": "Identifier"
      }, 
      "provenance": {
        "next": "ResourceReference"
      }, 
      "replaces": {
        "parser": "string"
      }, 
      "representation": {
        "next": "Attachment"
      }, 
      "section": {
        "next": "Document.section"
      }, 
      "status": {
        "parser": "string"
      }, 
      "stylesheet": {
        "next": "Attachment"
      }, 
      "subject": {
        "next": "ResourceReference"
      }, 
      "subtype": {
        "next": "CodeableConcept"
      }, 
      "text": {
        "next": "Narrative"
      }, 
      "title": {
        "parser": "string"
      }, 
      "type": {
        "next": "CodeableConcept"
      }, 
      "versionIdentifier": {
        "next": "Identifier"
      }
    }
  }, 
  "Document.attester": {
    "edges": {
      "mode": {
        "parser": "string"
      }, 
      "party": {
        "next": "ResourceReference"
      }, 
      "time": {
        "parser": "date"
      }
    }
  }, 
  "Document.event": {
    "edges": {
      "code": {
        "next": "CodeableConcept"
      }, 
      "detail": {
        "next": "ResourceReference"
      }, 
      "period": {
        "next": "Period"
      }
    }
  }, 
  "Document.section": {
    "edges": {
      "code": {
        "next": "CodeableConcept"
      }, 
      "content": {
        "next": "ResourceReference"
      }, 
      "section": {
        "next": "Document.section"
      }, 
      "subject": {
        "next": "ResourceReference"
      }
    }
  }, 
  "DocumentReference": {
    "edges": {
      "authenticator": {
        "next": "ResourceReference"
      }, 
      "author": {
        "next": "ResourceReference"
      }, 
      "confidentiality": {
        "next": "CodeableConcept"
      }, 
      "contained": {
        "next": "Resource"
      }, 
      "context": {
        "next": "DocumentReference.context"
      }, 
      "created": {
        "parser": "date"
      }, 
      "custodian": {
        "next": "ResourceReference"
      }, 
      "description": {
        "parser": "string"
      }, 
      "docStatus": {
        "next": "CodeableConcept"
      }, 
      "extension": {
        "next": "Extension"
      }, 
      "format": {
        "next": "CodeableConcept"
      }, 
      "hash": {
        "parser": "string"
      }, 
      "identifier": {
        "next": "Identifier"
      }, 
      "indexed": {
        "parser": "date"
      }, 
      "location": {
        "parser": "string"
      }, 
      "masterIdentifier": {
        "next": "Identifier"
      }, 
      "mimeType": {
        "parser": "string"
      }, 
      "primaryLanguage": {
        "parser": "string"
      }, 
      "service": {
        "next": "DocumentReference.service"
      }, 
      "size": {
        "parser": "integer"
      }, 
      "status": {
        "parser": "string"
      }, 
      "subject": {
        "next": "ResourceReference"
      }, 
      "subtype": {
        "next": "CodeableConcept"
      }, 
      "supercedes": {
        "next": "ResourceReference"
      }, 
      "text": {
        "next": "Narrative"
      }, 
      "type": {
        "next": "CodeableConcept"
      }
    }
  }, 
  "DocumentReference.context": {
    "edges": {
      "code": {
        "next": "CodeableConcept"
      }, 
      "facilityType": {
        "next": "CodeableConcept"
      }, 
      "period": {
        "next": "Period"
      }
    }
  }, 
  "DocumentReference.service": {
    "edges": {
      "address": {
        "parser": "string"
      }, 
      "parameter": {
        "next": "DocumentReference.service.parameter"
      }, 
      "type": {
        "next": "CodeableConcept"
      }
    }
  }, 
  "DocumentReference.service.parameter": {
    "edges": {
      "name": {
        "parser": "string"
      }, 
      "value": {
        "parser": "string"
      }
    }
  }, 
  "Encounter": {
    "edges": {
      "class": {
        "parser": "string"
      }, 
      "contained": {
        "next": "Resource"
      }, 
      "extension": {
        "next": "Extension"
      }, 
      "fulfills": {
        "next": "ResourceReference"
      }, 
      "hospitalization": {
        "next": "Encounter.hospitalization"
      }, 
      "identifier": {
        "next": "Identifier"
      }, 
      "indication": {
        "next": "ResourceReference"
      }, 
      "length": {
        "next": "Duration"
      }, 
      "location": {
        "next": "Encounter.location"
      }, 
      "partOf": {
        "next": "ResourceReference"
      }, 
      "participant": {
        "next": "Encounter.participant"
      }, 
      "priority": {
        "next": "CodeableConcept"
      }, 
      "reasonCodeableConcept": {
        "next": "CodeableConcept"
      }, 
      "reasonstring": {
        "parser": "string"
      }, 
      "serviceProvider": {
        "next": "ResourceReference"
      }, 
      "start": {
        "parser": "date"
      }, 
      "status": {
        "parser": "string"
      }, 
      "subject": {
        "next": "ResourceReference"
      }, 
      "text": {
        "next": "Narrative"
      }, 
      "type": {
        "next": "CodeableConcept"
      }
    }
  }, 
  "Encounter.hospitalization": {
    "edges": {
      "accomodation": {
        "next": "Encounter.hospitalization.accomodation"
      }, 
      "admitSource": {
        "next": "CodeableConcept"
      }, 
      "destination": {
        "next": "ResourceReference"
      }, 
      "diet": {
        "next": "CodeableConcept"
      }, 
      "dischargeDisposition": {
        "next": "CodeableConcept"
      }, 
      "origin": {
        "next": "ResourceReference"
      }, 
      "period": {
        "next": "Period"
      }, 
      "preAdmissionIdentifier": {
        "next": "Identifier"
      }, 
      "reAdmission": {
        "parser": "boolean"
      }, 
      "specialArrangement": {
        "next": "CodeableConcept"
      }, 
      "specialCourtesy": {
        "next": "CodeableConcept"
      }
    }
  }, 
  "Encounter.hospitalization.accomodation": {
    "edges": {
      "bed": {
        "next": "ResourceReference"
      }, 
      "period": {
        "next": "Period"
      }
    }
  }, 
  "Encounter.location": {
    "edges": {
      "location": {
        "next": "ResourceReference"
      }, 
      "period": {
        "next": "Period"
      }
    }
  }, 
  "Encounter.participant": {
    "edges": {
      "practitioner": {
        "next": "ResourceReference"
      }, 
      "type": {
        "parser": "string"
      }
    }
  }, 
  "Extension": {
    "edges": {
      "isModifier": {
        "parser": "boolean"
      }, 
      "url": {
        "parser": "string"
      }, 
      "value": {
        "next": "Extension.value"
      }
    }
  }, 
  "FamilyHistory": {
    "edges": {
      "contained": {
        "next": "Resource"
      }, 
      "extension": {
        "next": "Extension"
      }, 
      "note": {
        "parser": "string"
      }, 
      "relation": {
        "next": "FamilyHistory.relation"
      }, 
      "subject": {
        "next": "ResourceReference"
      }, 
      "text": {
        "next": "Narrative"
      }
    }
  }, 
  "FamilyHistory.relation": {
    "edges": {
      "condition": {
        "next": "FamilyHistory.relation.condition"
      }, 
      "deceasedAge": {
        "next": "Age"
      }, 
      "deceasedRange": {
        "next": "Range"
      }, 
      "deceasedboolean": {
        "parser": "boolean"
      }, 
      "deceasedstring": {
        "parser": "string"
      }, 
      "name": {
        "parser": "string"
      }, 
      "note": {
        "parser": "string"
      }, 
      "relationship": {
        "next": "CodeableConcept"
      }
    }
  }, 
  "FamilyHistory.relation.condition": {
    "edges": {
      "note": {
        "parser": "string"
      }, 
      "onsetAge": {
        "next": "Age"
      }, 
      "onsetRange": {
        "next": "Range"
      }, 
      "onsetstring": {
        "parser": "string"
      }, 
      "outcome": {
        "next": "CodeableConcept"
      }, 
      "type": {
        "next": "CodeableConcept"
      }
    }
  }, 
  "Group": {
    "edges": {
      "actual": {
        "parser": "boolean"
      }, 
      "characteristic": {
        "next": "Group.characteristic"
      }, 
      "code": {
        "next": "CodeableConcept"
      }, 
      "contained": {
        "next": "Resource"
      }, 
      "extension": {
        "next": "Extension"
      }, 
      "identifier": {
        "next": "Identifier"
      }, 
      "member": {
        "next": "ResourceReference"
      }, 
      "name": {
        "parser": "string"
      }, 
      "quantity": {
        "parser": "integer"
      }, 
      "text": {
        "next": "Narrative"
      }, 
      "type": {
        "parser": "string"
      }
    }
  }, 
  "Group.characteristic": {
    "edges": {
      "exclude": {
        "parser": "boolean"
      }, 
      "type": {
        "next": "CodeableConcept"
      }, 
      "valueCodeableConcept": {
        "next": "CodeableConcept"
      }, 
      "valueQuantity": {
        "next": "Quantity"
      }, 
      "valueRange": {
        "next": "Range"
      }, 
      "valueboolean": {
        "parser": "boolean"
      }, 
      "valuestring": {
        "parser": "string"
      }
    }
  }, 
  "HumanName": {
    "edges": {
      "family": {
        "parser": "string"
      }, 
      "given": {
        "parser": "string"
      }, 
      "period": {
        "next": "Period"
      }, 
      "prefix": {
        "parser": "string"
      }, 
      "suffix": {
        "parser": "string"
      }, 
      "text": {
        "parser": "string"
      }, 
      "use": {
        "parser": "string"
      }
    }
  }, 
  "Identifier": {
    "edges": {
      "assigner": {
        "next": "ResourceReference"
      }, 
      "key": {
        "parser": "string"
      }, 
      "label": {
        "parser": "string"
      }, 
      "period": {
        "next": "Period"
      }, 
      "system": {
        "parser": "string"
      }, 
      "use": {
        "parser": "string"
      }
    }
  }, 
  "ImagingStudy": {
    "edges": {
      "accessionNo": {
        "next": "Identifier"
      }, 
      "availability": {
        "parser": "string"
      }, 
      "clinicalInformation": {
        "parser": "string"
      }, 
      "contained": {
        "next": "Resource"
      }, 
      "dateTime": {
        "parser": "date"
      }, 
      "description": {
        "parser": "string"
      }, 
      "extension": {
        "next": "Extension"
      }, 
      "identifier": {
        "next": "Identifier"
      }, 
      "interpreter": {
        "next": "ResourceReference"
      }, 
      "modality": {
        "parser": "string"
      }, 
      "numberOfInstances": {
        "parser": "integer"
      }, 
      "numberOfSeries": {
        "parser": "integer"
      }, 
      "procedure": {
        "next": "Coding"
      }, 
      "referrer": {
        "next": "ResourceReference"
      }, 
      "series": {
        "next": "ImagingStudy.series"
      }, 
      "subject": {
        "next": "ResourceReference"
      }, 
      "text": {
        "next": "Narrative"
      }, 
      "uid": {
        "parser": "string"
      }, 
      "url": {
        "parser": "string"
      }
    }
  }, 
  "ImagingStudy.series": {
    "edges": {
      "availability": {
        "parser": "string"
      }, 
      "bodySite": {
        "next": "Coding"
      }, 
      "dateTime": {
        "parser": "date"
      }, 
      "description": {
        "parser": "string"
      }, 
      "instance": {
        "next": "ImagingStudy.series.instance"
      }, 
      "modality": {
        "parser": "string"
      }, 
      "number": {
        "parser": "integer"
      }, 
      "numberOfInstances": {
        "parser": "integer"
      }, 
      "uid": {
        "parser": "string"
      }, 
      "url": {
        "parser": "string"
      }
    }
  }, 
  "ImagingStudy.series.instance": {
    "edges": {
      "attachment": {
        "next": "ResourceReference"
      }, 
      "number": {
        "parser": "integer"
      }, 
      "sopclass": {
        "parser": "string"
      }, 
      "title": {
        "parser": "string"
      }, 
      "type": {
        "parser": "string"
      }, 
      "uid": {
        "parser": "string"
      }, 
      "url": {
        "parser": "string"
      }
    }
  }, 
  "Immunization": {
    "edges": {
      "contained": {
        "next": "Resource"
      }, 
      "date": {
        "parser": "date"
      }, 
      "doseQuantity": {
        "next": "Quantity"
      }, 
      "expirationDate": {
        "next": "date"
      }, 
      "explanation": {
        "next": "Immunization.explanation"
      }, 
      "extension": {
        "next": "Extension"
      }, 
      "location": {
        "next": "ResourceReference"
      }, 
      "lotNumber": {
        "parser": "string"
      }, 
      "manufacturer": {
        "next": "ResourceReference"
      }, 
      "performer": {
        "next": "ResourceReference"
      }, 
      "reaction": {
        "next": "Immunization.reaction"
      }, 
      "refusedIndicator": {
        "parser": "boolean"
      }, 
      "reported": {
        "parser": "boolean"
      }, 
      "requester": {
        "next": "ResourceReference"
      }, 
      "route": {
        "next": "CodeableConcept"
      }, 
      "site": {
        "next": "CodeableConcept"
      }, 
      "subject": {
        "next": "ResourceReference"
      }, 
      "text": {
        "next": "Narrative"
      }, 
      "vaccinationProtocol": {
        "next": "Immunization.vaccinationProtocol"
      }, 
      "vaccineType": {
        "next": "CodeableConcept"
      }
    }
  }, 
  "Immunization.explanation": {
    "edges": {
      "reason": {
        "next": "CodeableConcept"
      }, 
      "refusalReason": {
        "next": "CodeableConcept"
      }
    }
  }, 
  "Immunization.reaction": {
    "edges": {
      "date": {
        "parser": "date"
      }, 
      "detail": {
        "next": "ResourceReference"
      }, 
      "reported": {
        "parser": "boolean"
      }
    }
  }, 
  "Immunization.vaccinationProtocol": {
    "edges": {
      "authority": {
        "next": "ResourceReference"
      }, 
      "description": {
        "parser": "string"
      }, 
      "doseSequence": {
        "parser": "integer"
      }, 
      "doseStatus": {
        "next": "CodeableConcept"
      }, 
      "doseStatusReason": {
        "next": "CodeableConcept"
      }, 
      "doseTarget": {
        "next": "CodeableConcept"
      }, 
      "series": {
        "parser": "string"
      }, 
      "seriesDoses": {
        "parser": "integer"
      }
    }
  }, 
  "ImmunizationProfile": {
    "edges": {
      "contained": {
        "next": "Resource"
      }, 
      "extension": {
        "next": "Extension"
      }, 
      "recommendation": {
        "next": "ImmunizationProfile.recommendation"
      }, 
      "subject": {
        "next": "ResourceReference"
      }, 
      "text": {
        "next": "Narrative"
      }
    }
  }, 
  "ImmunizationProfile.recommendation": {
    "edges": {
      "dateCriterion": {
        "next": "ImmunizationProfile.recommendation.dateCriterion"
      }, 
      "doseNumber": {
        "parser": "integer"
      }, 
      "forecastStatus": {
        "parser": "string"
      }, 
      "protocol": {
        "next": "ImmunizationProfile.recommendation.protocol"
      }, 
      "recommendationDate": {
        "parser": "date"
      }, 
      "supportingAdverseEventReport": {
        "next": "ImmunizationProfile.recommendation.supportingAdverseEventReport"
      }, 
      "supportingImmunization": {
        "next": "ResourceReference"
      }, 
      "supportingPatientObservation": {
        "next": "ResourceReference"
      }, 
      "vaccineType": {
        "next": "CodeableConcept"
      }
    }
  }, 
  "ImmunizationProfile.recommendation.dateCriterion": {
    "edges": {
      "code": {
        "next": "CodeableConcept"
      }, 
      "value": {
        "parser": "date"
      }
    }
  }, 
  "ImmunizationProfile.recommendation.protocol": {
    "edges": {
      "authority": {
        "next": "ResourceReference"
      }, 
      "description": {
        "parser": "string"
      }, 
      "doseSequence": {
        "parser": "integer"
      }, 
      "series": {
        "parser": "string"
      }
    }
  }, 
  "ImmunizationProfile.recommendation.supportingAdverseEventReport": {
    "edges": {
      "identifier": {
        "parser": "string"
      }, 
      "reaction": {
        "next": "ResourceReference"
      }, 
      "reportDate": {
        "parser": "date"
      }, 
      "reportType": {
        "next": "CodeableConcept"
      }, 
      "text": {
        "parser": "string"
      }
    }
  }, 
  "List": {
    "edges": {
      "code": {
        "next": "CodeableConcept"
      }, 
      "contained": {
        "next": "Resource"
      }, 
      "date": {
        "parser": "date"
      }, 
      "emptyReason": {
        "next": "CodeableConcept"
      }, 
      "entry": {
        "next": "List.entry"
      }, 
      "extension": {
        "next": "Extension"
      }, 
      "mode": {
        "parser": "string"
      }, 
      "ordered": {
        "parser": "boolean"
      }, 
      "source": {
        "next": "ResourceReference"
      }, 
      "text": {
        "next": "Narrative"
      }
    }
  }, 
  "List.entry": {
    "edges": {
      "date": {
        "parser": "date"
      }, 
      "deleted": {
        "parser": "boolean"
      }, 
      "flag": {
        "next": "CodeableConcept"
      }, 
      "item": {
        "next": "ResourceReference"
      }
    }
  }, 
  "Location": {
    "edges": {
      "active": {
        "parser": "boolean"
      }, 
      "address": {
        "next": "Address"
      }, 
      "contained": {
        "next": "Resource"
      }, 
      "description": {
        "parser": "string"
      }, 
      "extension": {
        "next": "Extension"
      }, 
      "name": {
        "parser": "string"
      }, 
      "partOf": {
        "next": "ResourceReference"
      }, 
      "position": {
        "next": "Location.position"
      }, 
      "provider": {
        "next": "ResourceReference"
      }, 
      "telecom": {
        "next": "Contact"
      }, 
      "text": {
        "next": "Narrative"
      }, 
      "type": {
        "next": "CodeableConcept"
      }
    }
  }, 
  "Location.position": {
    "edges": {
      "altitude": {
        "parser": "float"
      }, 
      "latitude": {
        "parser": "float"
      }, 
      "longitude": {
        "parser": "float"
      }
    }
  }, 
  "Media": {
    "edges": {
      "contained": {
        "next": "Resource"
      }, 
      "content": {
        "next": "Attachment"
      }, 
      "dateTime": {
        "parser": "date"
      }, 
      "deviceName": {
        "parser": "string"
      }, 
      "extension": {
        "next": "Extension"
      }, 
      "frames": {
        "parser": "integer"
      }, 
      "height": {
        "parser": "integer"
      }, 
      "identifier": {
        "next": "Identifier"
      }, 
      "length": {
        "parser": "integer"
      }, 
      "operator": {
        "next": "ResourceReference"
      }, 
      "requester": {
        "next": "ResourceReference"
      }, 
      "subject": {
        "next": "ResourceReference"
      }, 
      "subtype": {
        "next": "CodeableConcept"
      }, 
      "text": {
        "next": "Narrative"
      }, 
      "type": {
        "parser": "string"
      }, 
      "view": {
        "next": "CodeableConcept"
      }, 
      "width": {
        "parser": "integer"
      }
    }
  }, 
  "Medication": {
    "edges": {
      "code": {
        "next": "CodeableConcept"
      }, 
      "contained": {
        "next": "Resource"
      }, 
      "extension": {
        "next": "Extension"
      }, 
      "isBrand": {
        "parser": "boolean"
      }, 
      "kind": {
        "parser": "string"
      }, 
      "manufacturer": {
        "next": "ResourceReference"
      }, 
      "name": {
        "parser": "string"
      }, 
      "package": {
        "next": "Medication.package"
      }, 
      "product": {
        "next": "Medication.product"
      }, 
      "text": {
        "next": "Narrative"
      }
    }
  }, 
  "Medication.package": {
    "edges": {
      "container": {
        "next": "CodeableConcept"
      }, 
      "content": {
        "next": "Medication.package.content"
      }
    }
  }, 
  "Medication.package.content": {
    "edges": {
      "amount": {
        "next": "Quantity"
      }, 
      "item": {
        "next": "ResourceReference"
      }
    }
  }, 
  "Medication.product": {
    "edges": {
      "form": {
        "next": "CodeableConcept"
      }, 
      "ingredient": {
        "next": "Medication.product.ingredient"
      }
    }
  }, 
  "Medication.product.ingredient": {
    "edges": {
      "amount": {
        "next": "Ratio"
      }, 
      "item": {
        "next": "ResourceReference"
      }
    }
  }, 
  "MedicationAdministration": {
    "edges": {
      "administrationDevice": {
        "next": "ResourceReference"
      }, 
      "contained": {
        "next": "Resource"
      }, 
      "dosage": {
        "next": "MedicationAdministration.dosage"
      }, 
      "encounter": {
        "next": "ResourceReference"
      }, 
      "extension": {
        "next": "Extension"
      }, 
      "identifier": {
        "next": "Identifier"
      }, 
      "medication": {
        "next": "ResourceReference"
      }, 
      "patient": {
        "next": "ResourceReference"
      }, 
      "practitioner": {
        "next": "ResourceReference"
      }, 
      "prescription": {
        "next": "ResourceReference"
      }, 
      "reasonNotGiven": {
        "next": "CodeableConcept"
      }, 
      "status": {
        "parser": "string"
      }, 
      "text": {
        "next": "Narrative"
      }, 
      "wasNotGiven": {
        "parser": "boolean"
      }, 
      "whenGiven": {
        "next": "Period"
      }
    }
  }, 
  "MedicationAdministration.dosage": {
    "edges": {
      "maxDosePerPeriod": {
        "next": "Ratio"
      }, 
      "method": {
        "next": "CodeableConcept"
      }, 
      "quantity": {
        "next": "Quantity"
      }, 
      "rate": {
        "next": "Ratio"
      }, 
      "route": {
        "next": "CodeableConcept"
      }, 
      "site": {
        "next": "CodeableConcept"
      }, 
      "timing": {
        "next": "Schedule"
      }
    }
  }, 
  "MedicationDispense": {
    "edges": {
      "authorizingPrescription": {
        "next": "ResourceReference"
      }, 
      "contained": {
        "next": "Resource"
      }, 
      "dispense": {
        "next": "MedicationDispense.dispense"
      }, 
      "dispenser": {
        "next": "ResourceReference"
      }, 
      "extension": {
        "next": "Extension"
      }, 
      "identifier": {
        "next": "Identifier"
      }, 
      "patient": {
        "next": "ResourceReference"
      }, 
      "status": {
        "parser": "string"
      }, 
      "substitution": {
        "next": "MedicationDispense.substitution"
      }, 
      "text": {
        "next": "Narrative"
      }
    }
  }, 
  "MedicationDispense.dispense": {
    "edges": {
      "destination": {
        "next": "ResourceReference"
      }, 
      "dosage": {
        "next": "MedicationDispense.dispense.dosage"
      }, 
      "identifier": {
        "next": "Identifier"
      }, 
      "medication": {
        "next": "ResourceReference"
      }, 
      "quantity": {
        "next": "Quantity"
      }, 
      "receiver": {
        "next": "ResourceReference"
      }, 
      "status": {
        "parser": "string"
      }, 
      "type": {
        "next": "CodeableConcept"
      }, 
      "whenHandedOver": {
        "next": "Period"
      }, 
      "whenPrepared": {
        "next": "Period"
      }
    }
  }, 
  "MedicationDispense.dispense.dosage": {
    "edges": {
      "additionalInstructionsCodeableConcept": {
        "next": "CodeableConcept"
      }, 
      "additionalInstructionsstring": {
        "parser": "string"
      }, 
      "maxDosePerPeriod": {
        "next": "Ratio"
      }, 
      "method": {
        "next": "CodeableConcept"
      }, 
      "quantity": {
        "next": "Quantity"
      }, 
      "rate": {
        "next": "Ratio"
      }, 
      "route": {
        "next": "CodeableConcept"
      }, 
      "site": {
        "next": "CodeableConcept"
      }, 
      "timingPeriod": {
        "next": "Period"
      }, 
      "timingSchedule": {
        "next": "Schedule"
      }, 
      "timingdateTime": {
        "parser": "date"
      }
    }
  }, 
  "MedicationDispense.substitution": {
    "edges": {
      "reason": {
        "next": "CodeableConcept"
      }, 
      "responsibleParty": {
        "next": "ResourceReference"
      }, 
      "type": {
        "next": "CodeableConcept"
      }
    }
  }, 
  "MedicationPrescription": {
    "edges": {
      "contained": {
        "next": "Resource"
      }, 
      "dateWritten": {
        "parser": "date"
      }, 
      "dispense": {
        "next": "MedicationPrescription.dispense"
      }, 
      "dosageInstruction": {
        "next": "MedicationPrescription.dosageInstruction"
      }, 
      "encounter": {
        "next": "ResourceReference"
      }, 
      "extension": {
        "next": "Extension"
      }, 
      "identifier": {
        "next": "Identifier"
      }, 
      "medication": {
        "next": "ResourceReference"
      }, 
      "patient": {
        "next": "ResourceReference"
      }, 
      "prescriber": {
        "next": "ResourceReference"
      }, 
      "reasonForPrescribingCodeableConcept": {
        "next": "CodeableConcept"
      }, 
      "reasonForPrescribingstring": {
        "parser": "string"
      }, 
      "status": {
        "parser": "string"
      }, 
      "substitution": {
        "next": "MedicationPrescription.substitution"
      }, 
      "text": {
        "next": "Narrative"
      }
    }
  }, 
  "MedicationPrescription.dispense": {
    "edges": {
      "expectedSupplyDuration": {
        "next": "Duration"
      }, 
      "medication": {
        "next": "ResourceReference"
      }, 
      "numberOfRepeatsAllowed": {
        "parser": "integer"
      }, 
      "quantity": {
        "next": "Quantity"
      }, 
      "validityPeriod": {
        "next": "Period"
      }
    }
  }, 
  "MedicationPrescription.dosageInstruction": {
    "edges": {
      "additionalInstructionsCodeableConcept": {
        "next": "CodeableConcept"
      }, 
      "additionalInstructionsstring": {
        "parser": "string"
      }, 
      "dosageInstructionsText": {
        "parser": "string"
      }, 
      "doseQuantity": {
        "next": "Quantity"
      }, 
      "maxDosePerPeriod": {
        "next": "Ratio"
      }, 
      "method": {
        "next": "CodeableConcept"
      }, 
      "rate": {
        "next": "Ratio"
      }, 
      "route": {
        "next": "CodeableConcept"
      }, 
      "site": {
        "next": "CodeableConcept"
      }, 
      "timingPeriod": {
        "next": "Period"
      }, 
      "timingSchedule": {
        "next": "Schedule"
      }, 
      "timingdateTime": {
        "parser": "date"
      }
    }
  }, 
  "MedicationPrescription.substitution": {
    "edges": {
      "reason": {
        "next": "CodeableConcept"
      }, 
      "type": {
        "next": "CodeableConcept"
      }
    }
  }, 
  "MedicationStatement": {
    "edges": {
      "administrationDevice": {
        "next": "ResourceReference"
      }, 
      "contained": {
        "next": "Resource"
      }, 
      "dosage": {
        "next": "MedicationStatement.dosage"
      }, 
      "extension": {
        "next": "Extension"
      }, 
      "identifier": {
        "next": "Identifier"
      }, 
      "medication": {
        "next": "ResourceReference"
      }, 
      "patient": {
        "next": "ResourceReference"
      }, 
      "reasonNotGiven": {
        "next": "CodeableConcept"
      }, 
      "text": {
        "next": "Narrative"
      }, 
      "wasNotGiven": {
        "parser": "boolean"
      }, 
      "whenGiven": {
        "next": "Period"
      }
    }
  }, 
  "MedicationStatement.dosage": {
    "edges": {
      "maxDosePerPeriod": {
        "next": "Ratio"
      }, 
      "method": {
        "next": "CodeableConcept"
      }, 
      "quantity": {
        "next": "Quantity"
      }, 
      "rate": {
        "next": "Ratio"
      }, 
      "route": {
        "next": "CodeableConcept"
      }, 
      "site": {
        "next": "CodeableConcept"
      }, 
      "timing": {
        "next": "Schedule"
      }
    }
  }, 
  "Message": {
    "edges": {
      "author": {
        "next": "ResourceReference"
      }, 
      "contained": {
        "next": "Resource"
      }, 
      "data": {
        "next": "ResourceReference"
      }, 
      "destination": {
        "next": "Message.destination"
      }, 
      "effective": {
        "next": "Period"
      }, 
      "enterer": {
        "next": "ResourceReference"
      }, 
      "event": {
        "parser": "string"
      }, 
      "extension": {
        "next": "Extension"
      }, 
      "identifier": {
        "parser": "string"
      }, 
      "reason": {
        "next": "CodeableConcept"
      }, 
      "receiver": {
        "next": "ResourceReference"
      }, 
      "response": {
        "next": "Message.response"
      }, 
      "responsible": {
        "next": "ResourceReference"
      }, 
      "source": {
        "next": "Message.source"
      }, 
      "text": {
        "next": "Narrative"
      }, 
      "timestamp": {
        "parser": "date"
      }
    }
  }, 
  "Message.destination": {
    "edges": {
      "endpoint": {
        "parser": "string"
      }, 
      "name": {
        "parser": "string"
      }, 
      "target": {
        "next": "ResourceReference"
      }
    }
  }, 
  "Message.response": {
    "edges": {
      "code": {
        "parser": "string"
      }, 
      "details": {
        "next": "ResourceReference"
      }, 
      "identifier": {
        "parser": "string"
      }
    }
  }, 
  "Message.source": {
    "edges": {
      "contact": {
        "next": "Contact"
      }, 
      "endpoint": {
        "parser": "string"
      }, 
      "name": {
        "parser": "string"
      }, 
      "software": {
        "parser": "string"
      }, 
      "version": {
        "parser": "string"
      }
    }
  }, 
  "Narrative": {
    "edges": {
      "div": {
        "parser": "string"
      }, 
      "status": {
        "parser": "string"
      }
    }
  }, 
  "Observation": {
    "edges": {
      "appliesPeriod": {
        "next": "Period"
      }, 
      "appliesdateTime": {
        "parser": "date"
      }, 
      "bodySite": {
        "next": "CodeableConcept"
      }, 
      "comments": {
        "parser": "string"
      }, 
      "component": {
        "next": "Observation.component"
      }, 
      "contained": {
        "next": "Resource"
      }, 
      "extension": {
        "next": "Extension"
      }, 
      "identifier": {
        "next": "Identifier"
      }, 
      "interpretation": {
        "next": "CodeableConcept"
      }, 
      "issued": {
        "parser": "date"
      }, 
      "method": {
        "next": "CodeableConcept"
      }, 
      "name": {
        "next": "CodeableConcept"
      }, 
      "performer": {
        "next": "ResourceReference"
      }, 
      "referenceRange": {
        "next": "Observation.referenceRange"
      }, 
      "reliability": {
        "parser": "string"
      }, 
      "status": {
        "parser": "string"
      }, 
      "subject": {
        "next": "ResourceReference"
      }, 
      "text": {
        "next": "Narrative"
      }, 
      "valueAttachment": {
        "next": "Attachment"
      }, 
      "valueChoice": {
        "next": "Choice"
      }, 
      "valueCodeableConcept": {
        "next": "CodeableConcept"
      }, 
      "valuePeriod": {
        "next": "Period"
      }, 
      "valueQuantity": {
        "next": "Quantity"
      }, 
      "valueRatio": {
        "next": "Ratio"
      }, 
      "valueSampledData": {
        "next": "SampledData"
      }, 
      "valuestring": {
        "parser": "string"
      }
    }
  }, 
  "Observation.component": {
    "edges": {
      "name": {
        "next": "CodeableConcept"
      }, 
      "valueAttachment": {
        "next": "Attachment"
      }, 
      "valueChoice": {
        "next": "Choice"
      }, 
      "valueCodeableConcept": {
        "next": "CodeableConcept"
      }, 
      "valuePeriod": {
        "next": "Period"
      }, 
      "valueQuantity": {
        "next": "Quantity"
      }, 
      "valueRatio": {
        "next": "Ratio"
      }, 
      "valueSampledData": {
        "next": "SampledData"
      }, 
      "valuestring": {
        "parser": "string"
      }
    }
  }, 
  "Observation.referenceRange": {
    "edges": {
      "meaning": {
        "next": "CodeableConcept"
      }, 
      "rangeQuantity": {
        "next": "Quantity"
      }, 
      "rangeRange": {
        "next": "Range"
      }, 
      "rangestring": {
        "parser": "string"
      }
    }
  }, 
  "OperationOutcome": {
    "edges": {
      "contained": {
        "next": "Resource"
      }, 
      "extension": {
        "next": "Extension"
      }, 
      "issue": {
        "next": "OperationOutcome.issue"
      }, 
      "text": {
        "next": "Narrative"
      }
    }
  }, 
  "OperationOutcome.issue": {
    "edges": {
      "details": {
        "parser": "string"
      }, 
      "location": {
        "parser": "string"
      }, 
      "severity": {
        "parser": "string"
      }, 
      "type": {
        "next": "Coding"
      }
    }
  }, 
  "Order": {
    "edges": {
      "authority": {
        "next": "ResourceReference"
      }, 
      "contained": {
        "next": "Resource"
      }, 
      "date": {
        "parser": "date"
      }, 
      "detail": {
        "next": "ResourceReference"
      }, 
      "extension": {
        "next": "Extension"
      }, 
      "reason": {
        "parser": "string"
      }, 
      "source": {
        "next": "ResourceReference"
      }, 
      "subject": {
        "next": "ResourceReference"
      }, 
      "target": {
        "next": "ResourceReference"
      }, 
      "text": {
        "next": "Narrative"
      }, 
      "when": {
        "next": "Order.when"
      }
    }
  }, 
  "Order.when": {
    "edges": {
      "code": {
        "next": "CodeableConcept"
      }, 
      "schedule": {
        "next": "Schedule"
      }
    }
  }, 
  "OrderResponse": {
    "edges": {
      "authority": {
        "next": "ResourceReference"
      }, 
      "code": {
        "parser": "string"
      }, 
      "contained": {
        "next": "Resource"
      }, 
      "cost": {
        "next": "Money"
      }, 
      "date": {
        "parser": "date"
      }, 
      "description": {
        "parser": "string"
      }, 
      "extension": {
        "next": "Extension"
      }, 
      "fulfillment": {
        "next": "ResourceReference"
      }, 
      "request": {
        "next": "ResourceReference"
      }, 
      "text": {
        "next": "Narrative"
      }, 
      "who": {
        "next": "ResourceReference"
      }
    }
  }, 
  "Organization": {
    "edges": {
      "active": {
        "parser": "boolean"
      }, 
      "address": {
        "next": "Address"
      }, 
      "contact": {
        "next": "Organization.contact"
      }, 
      "contained": {
        "next": "Resource"
      }, 
      "extension": {
        "next": "Extension"
      }, 
      "identifier": {
        "next": "Identifier"
      }, 
      "name": {
        "parser": "string"
      }, 
      "partOf": {
        "next": "ResourceReference"
      }, 
      "telecom": {
        "next": "Contact"
      }, 
      "text": {
        "next": "Narrative"
      }, 
      "type": {
        "next": "CodeableConcept"
      }
    }
  }, 
  "Organization.contact": {
    "edges": {
      "address": {
        "next": "Address"
      }, 
      "gender": {
        "next": "CodeableConcept"
      }, 
      "name": {
        "next": "HumanName"
      }, 
      "purpose": {
        "next": "CodeableConcept"
      }, 
      "telecom": {
        "next": "Contact"
      }
    }
  }, 
  "Other": {
    "edges": {
      "author": {
        "next": "ResourceReference"
      }, 
      "code": {
        "next": "CodeableConcept"
      }, 
      "contained": {
        "next": "Resource"
      }, 
      "created": {
        "next": "date"
      }, 
      "extension": {
        "next": "Extension"
      }, 
      "subject": {
        "next": "ResourceReference"
      }, 
      "text": {
        "next": "Narrative"
      }
    }
  }, 
  "Patient": {
    "edges": {
      "active": {
        "parser": "boolean"
      }, 
      "address": {
        "next": "Address"
      }, 
      "animal": {
        "next": "Patient.animal"
      }, 
      "birthDate": {
        "parser": "date"
      }, 
      "communication": {
        "next": "CodeableConcept"
      }, 
      "contact": {
        "next": "Patient.contact"
      }, 
      "contained": {
        "next": "Resource"
      }, 
      "deceasedboolean": {
        "parser": "boolean"
      }, 
      "deceaseddateTime": {
        "parser": "date"
      }, 
      "extension": {
        "next": "Extension"
      }, 
      "gender": {
        "next": "CodeableConcept"
      }, 
      "identifier": {
        "next": "Identifier"
      }, 
      "link": {
        "next": "ResourceReference"
      }, 
      "maritalStatus": {
        "next": "CodeableConcept"
      }, 
      "multipleBirthboolean": {
        "parser": "boolean"
      }, 
      "multipleBirthinteger": {
        "parser": "integer"
      }, 
      "name": {
        "next": "HumanName"
      }, 
      "photo": {
        "next": "Attachment"
      }, 
      "provider": {
        "next": "ResourceReference"
      }, 
      "telecom": {
        "next": "Contact"
      }, 
      "text": {
        "next": "Narrative"
      }
    }
  }, 
  "Patient.animal": {
    "edges": {
      "breed": {
        "next": "CodeableConcept"
      }, 
      "genderStatus": {
        "next": "CodeableConcept"
      }, 
      "species": {
        "next": "CodeableConcept"
      }
    }
  }, 
  "Patient.contact": {
    "edges": {
      "address": {
        "next": "Address"
      }, 
      "gender": {
        "next": "CodeableConcept"
      }, 
      "name": {
        "next": "HumanName"
      }, 
      "organization": {
        "next": "ResourceReference"
      }, 
      "relationship": {
        "next": "CodeableConcept"
      }, 
      "telecom": {
        "next": "Contact"
      }
    }
  }, 
  "Period": {
    "edges": {
      "end": {
        "parser": "date"
      }, 
      "start": {
        "parser": "date"
      }
    }
  }, 
  "Practitioner": {
    "edges": {
      "address": {
        "next": "Address"
      }, 
      "birthDate": {
        "parser": "date"
      }, 
      "communication": {
        "next": "CodeableConcept"
      }, 
      "contained": {
        "next": "Resource"
      }, 
      "extension": {
        "next": "Extension"
      }, 
      "gender": {
        "next": "CodeableConcept"
      }, 
      "identifier": {
        "next": "Identifier"
      }, 
      "name": {
        "next": "HumanName"
      }, 
      "organization": {
        "next": "ResourceReference"
      }, 
      "period": {
        "next": "Period"
      }, 
      "photo": {
        "next": "Attachment"
      }, 
      "qualification": {
        "next": "Practitioner.qualification"
      }, 
      "role": {
        "next": "CodeableConcept"
      }, 
      "specialty": {
        "next": "CodeableConcept"
      }, 
      "telecom": {
        "next": "Contact"
      }, 
      "text": {
        "next": "Narrative"
      }
    }
  }, 
  "Practitioner.qualification": {
    "edges": {
      "code": {
        "next": "CodeableConcept"
      }, 
      "issuer": {
        "next": "ResourceReference"
      }, 
      "period": {
        "next": "Period"
      }
    }
  }, 
  "Procedure": {
    "edges": {
      "bodySite": {
        "next": "CodeableConcept"
      }, 
      "complication": {
        "parser": "string"
      }, 
      "contained": {
        "next": "Resource"
      }, 
      "date": {
        "next": "Period"
      }, 
      "encounter": {
        "next": "ResourceReference"
      }, 
      "extension": {
        "next": "Extension"
      }, 
      "followUp": {
        "parser": "string"
      }, 
      "indication": {
        "parser": "string"
      }, 
      "notes": {
        "parser": "string"
      }, 
      "outcome": {
        "parser": "string"
      }, 
      "performer": {
        "next": "Procedure.performer"
      }, 
      "relatedItem": {
        "next": "Procedure.relatedItem"
      }, 
      "report": {
        "next": "ResourceReference"
      }, 
      "subject": {
        "next": "ResourceReference"
      }, 
      "text": {
        "next": "Narrative"
      }, 
      "type": {
        "next": "CodeableConcept"
      }
    }
  }, 
  "Procedure.performer": {
    "edges": {
      "person": {
        "next": "ResourceReference"
      }, 
      "role": {
        "next": "CodeableConcept"
      }
    }
  }, 
  "Procedure.relatedItem": {
    "edges": {
      "target": {
        "next": "ResourceReference"
      }, 
      "type": {
        "parser": "string"
      }
    }
  }, 
  "Profile": {
    "edges": {
      "binding": {
        "next": "Profile.binding"
      }, 
      "code": {
        "next": "Coding"
      }, 
      "contained": {
        "next": "Resource"
      }, 
      "date": {
        "parser": "date"
      }, 
      "description": {
        "parser": "string"
      }, 
      "experimental": {
        "parser": "boolean"
      }, 
      "extension": {
        "next": "Extension"
      }, 
      "extensionDefn": {
        "next": "Profile.extensionDefn"
      }, 
      "fhirVersion": {
        "parser": "string"
      }, 
      "identifier": {
        "parser": "string"
      }, 
      "name": {
        "parser": "string"
      }, 
      "publisher": {
        "parser": "string"
      }, 
      "status": {
        "parser": "string"
      }, 
      "structure": {
        "next": "Profile.structure"
      }, 
      "telecom": {
        "next": "Contact"
      }, 
      "text": {
        "next": "Narrative"
      }, 
      "version": {
        "parser": "string"
      }
    }
  }, 
  "Profile.binding": {
    "edges": {
      "conformance": {
        "parser": "string"
      }, 
      "description": {
        "parser": "string"
      }, 
      "isExtensible": {
        "parser": "boolean"
      }, 
      "name": {
        "parser": "string"
      }, 
      "referenceResourceReference": {
        "next": "ResourceReference"
      }, 
      "referenceuri": {
        "parser": "string"
      }
    }
  }, 
  "Profile.extensionDefn": {
    "edges": {
      "code": {
        "parser": "string"
      }, 
      "context": {
        "parser": "string"
      }, 
      "contextType": {
        "parser": "string"
      }, 
      "definition": {
        "next": "Profile.structure.element.definition"
      }
    }
  }, 
  "Profile.structure": {
    "edges": {
      "element": {
        "next": "Profile.structure.element"
      }, 
      "name": {
        "parser": "string"
      }, 
      "publish": {
        "parser": "boolean"
      }, 
      "purpose": {
        "parser": "string"
      }, 
      "type": {
        "parser": "string"
      }
    }
  }, 
  "Profile.structure.element": {
    "edges": {
      "definition": {
        "next": "Profile.structure.element.definition"
      }, 
      "name": {
        "parser": "string"
      }, 
      "path": {
        "parser": "string"
      }, 
      "slicing": {
        "next": "Profile.structure.element.slicing"
      }
    }
  }, 
  "Profile.structure.element.definition": {
    "edges": {
      "binding": {
        "parser": "string"
      }, 
      "comments": {
        "parser": "string"
      }, 
      "condition": {
        "parser": "string"
      }, 
      "constraint": {
        "next": "Profile.structure.element.definition.constraint"
      }, 
      "example": {
        "next": "Profile.structure.element.definition.example"
      }, 
      "formal": {
        "parser": "string"
      }, 
      "isModifier": {
        "parser": "boolean"
      }, 
      "mapping": {
        "next": "Profile.structure.element.definition.mapping"
      }, 
      "max": {
        "parser": "string"
      }, 
      "maxLength": {
        "parser": "integer"
      }, 
      "min": {
        "parser": "integer"
      }, 
      "mustSupport": {
        "parser": "boolean"
      }, 
      "nameReference": {
        "parser": "string"
      }, 
      "requirements": {
        "parser": "string"
      }, 
      "short": {
        "parser": "string"
      }, 
      "synonym": {
        "parser": "string"
      }, 
      "type": {
        "next": "Profile.structure.element.definition.type"
      }, 
      "value": {
        "next": "Profile.structure.element.definition.value"
      }
    }
  }, 
  "Profile.structure.element.definition.constraint": {
    "edges": {
      "human": {
        "parser": "string"
      }, 
      "key": {
        "parser": "string"
      }, 
      "name": {
        "parser": "string"
      }, 
      "ocl": {
        "parser": "string"
      }, 
      "severity": {
        "parser": "string"
      }, 
      "xpath": {
        "parser": "string"
      }
    }
  }, 
  "Profile.structure.element.definition.mapping": {
    "edges": {
      "map": {
        "parser": "string"
      }, 
      "target": {
        "parser": "string"
      }
    }
  }, 
  "Profile.structure.element.definition.type": {
    "edges": {
      "bundled": {
        "parser": "boolean"
      }, 
      "code": {
        "parser": "string"
      }, 
      "profile": {
        "parser": "string"
      }
    }
  }, 
  "Profile.structure.element.slicing": {
    "edges": {
      "discriminator": {
        "parser": "string"
      }, 
      "ordered": {
        "parser": "boolean"
      }, 
      "rules": {
        "parser": "string"
      }
    }
  }, 
  "Provenance": {
    "edges": {
      "agent": {
        "next": "Provenance.agent"
      }, 
      "contained": {
        "next": "Resource"
      }, 
      "entity": {
        "next": "Provenance.entity"
      }, 
      "extension": {
        "next": "Extension"
      }, 
      "location": {
        "next": "ResourceReference"
      }, 
      "period": {
        "next": "Period"
      }, 
      "policy": {
        "parser": "string"
      }, 
      "reason": {
        "next": "CodeableConcept"
      }, 
      "recorded": {
        "parser": "date"
      }, 
      "signature": {
        "parser": "string"
      }, 
      "target": {
        "next": "ResourceReference"
      }, 
      "text": {
        "next": "Narrative"
      }
    }
  }, 
  "Provenance.agent": {
    "edges": {
      "display": {
        "parser": "string"
      }, 
      "reference": {
        "parser": "string"
      }, 
      "role": {
        "next": "Coding"
      }, 
      "type": {
        "next": "Coding"
      }
    }
  }, 
  "Provenance.entity": {
    "edges": {
      "agent": {
        "next": "Provenance.agent"
      }, 
      "display": {
        "parser": "string"
      }, 
      "reference": {
        "parser": "string"
      }, 
      "role": {
        "parser": "string"
      }, 
      "type": {
        "next": "Coding"
      }
    }
  }, 
  "Quantity": {
    "edges": {
      "code": {
        "parser": "string"
      }, 
      "comparator": {
        "parser": "string"
      }, 
      "system": {
        "parser": "string"
      }, 
      "units": {
        "parser": "string"
      }, 
      "value": {
        "parser": "float"
      }
    }
  }, 
  "Query": {
    "edges": {
      "contained": {
        "next": "Resource"
      }, 
      "extension": {
        "next": "Extension"
      }, 
      "identifier": {
        "parser": "string"
      }, 
      "parameter": {
        "next": "Extension"
      }, 
      "response": {
        "next": "Query.response"
      }, 
      "text": {
        "next": "Narrative"
      }
    }
  }, 
  "Query.response": {
    "edges": {
      "first": {
        "next": "Extension"
      }, 
      "identifier": {
        "parser": "string"
      }, 
      "last": {
        "next": "Extension"
      }, 
      "next": {
        "next": "Extension"
      }, 
      "outcome": {
        "parser": "string"
      }, 
      "parameter": {
        "next": "Extension"
      }, 
      "previous": {
        "next": "Extension"
      }, 
      "reference": {
        "next": "ResourceReference"
      }, 
      "total": {
        "parser": "integer"
      }
    }
  }, 
  "Questionnaire": {
    "edges": {
      "author": {
        "next": "ResourceReference"
      }, 
      "authored": {
        "parser": "date"
      }, 
      "contained": {
        "next": "Resource"
      }, 
      "encounter": {
        "next": "ResourceReference"
      }, 
      "extension": {
        "next": "Extension"
      }, 
      "group": {
        "next": "Questionnaire.group"
      }, 
      "identifier": {
        "next": "Identifier"
      }, 
      "name": {
        "next": "CodeableConcept"
      }, 
      "question": {
        "next": "Questionnaire.question"
      }, 
      "source": {
        "next": "ResourceReference"
      }, 
      "status": {
        "parser": "string"
      }, 
      "subject": {
        "next": "ResourceReference"
      }, 
      "text": {
        "next": "Narrative"
      }
    }
  }, 
  "Questionnaire.group": {
    "edges": {
      "group": {
        "next": "Questionnaire.group"
      }, 
      "header": {
        "parser": "string"
      }, 
      "name": {
        "next": "CodeableConcept"
      }, 
      "question": {
        "next": "Questionnaire.question"
      }, 
      "subject": {
        "next": "ResourceReference"
      }, 
      "text": {
        "parser": "string"
      }
    }
  }, 
  "Questionnaire.question": {
    "edges": {
      "answerboolean": {
        "parser": "boolean"
      }, 
      "answerdate": {
        "next": "date"
      }, 
      "answerdateTime": {
        "parser": "date"
      }, 
      "answerdecimal": {
        "parser": "float"
      }, 
      "answerinstant": {
        "parser": "date"
      }, 
      "answerinteger": {
        "parser": "integer"
      }, 
      "answerstring": {
        "parser": "string"
      }, 
      "choice": {
        "next": "Coding"
      }, 
      "data": {
        "next": "Questionnaire.question.data"
      }, 
      "name": {
        "next": "CodeableConcept"
      }, 
      "optionsResourceReference": {
        "next": "ResourceReference"
      }, 
      "optionsuri": {
        "parser": "string"
      }, 
      "remarks": {
        "parser": "string"
      }, 
      "text": {
        "parser": "string"
      }
    }
  }, 
  "Range": {
    "edges": {
      "high": {
        "next": "Quantity"
      }, 
      "low": {
        "next": "Quantity"
      }
    }
  }, 
  "Ratio": {
    "edges": {
      "denominator": {
        "next": "Quantity"
      }, 
      "numerator": {
        "next": "Quantity"
      }
    }
  }, 
  "RelatedPerson": {
    "edges": {
      "address": {
        "next": "Address"
      }, 
      "contained": {
        "next": "Resource"
      }, 
      "extension": {
        "next": "Extension"
      }, 
      "gender": {
        "next": "CodeableConcept"
      }, 
      "identifier": {
        "next": "Identifier"
      }, 
      "name": {
        "next": "HumanName"
      }, 
      "patient": {
        "next": "ResourceReference"
      }, 
      "photo": {
        "next": "Attachment"
      }, 
      "relationship": {
        "next": "CodeableConcept"
      }, 
      "telecom": {
        "next": "Contact"
      }, 
      "text": {
        "next": "Narrative"
      }
    }
  }, 
  "ResourceReference": {
    "edges": {
      "display": {
        "parser": "string"
      }, 
      "reference": {
        "parser": "string"
      }, 
      "type": {
        "parser": "string"
      }
    }
  }, 
  "SampledData": {
    "edges": {
      "data": {
        "parser": "string"
      }, 
      "dimensions": {
        "parser": "integer"
      }, 
      "factor": {
        "parser": "float"
      }, 
      "lowerLimit": {
        "parser": "float"
      }, 
      "origin": {
        "next": "Quantity"
      }, 
      "period": {
        "parser": "float"
      }, 
      "upperLimit": {
        "parser": "float"
      }
    }
  }, 
  "Schedule": {
    "edges": {
      "event": {
        "next": "Period"
      }, 
      "repeat": {
        "next": "Schedule.repeat"
      }
    }
  }, 
  "Schedule.repeat": {
    "edges": {
      "count": {
        "parser": "integer"
      }, 
      "duration": {
        "parser": "float"
      }, 
      "end": {
        "parser": "date"
      }, 
      "frequency": {
        "parser": "integer"
      }, 
      "units": {
        "parser": "string"
      }, 
      "when": {
        "parser": "string"
      }
    }
  }, 
  "SecurityEvent": {
    "edges": {
      "contained": {
        "next": "Resource"
      }, 
      "event": {
        "next": "SecurityEvent.event"
      }, 
      "extension": {
        "next": "Extension"
      }, 
      "object": {
        "next": "SecurityEvent.object"
      }, 
      "participant": {
        "next": "SecurityEvent.participant"
      }, 
      "source": {
        "next": "SecurityEvent.source"
      }, 
      "text": {
        "next": "Narrative"
      }
    }
  }, 
  "SecurityEvent.event": {
    "edges": {
      "action": {
        "parser": "string"
      }, 
      "dateTime": {
        "parser": "date"
      }, 
      "outcome": {
        "parser": "string"
      }, 
      "outcomeDesc": {
        "parser": "string"
      }, 
      "subtype": {
        "next": "CodeableConcept"
      }, 
      "type": {
        "next": "CodeableConcept"
      }
    }
  }, 
  "SecurityEvent.object": {
    "edges": {
      "detail": {
        "next": "SecurityEvent.object.detail"
      }, 
      "identifier": {
        "next": "Identifier"
      }, 
      "lifecycle": {
        "parser": "string"
      }, 
      "name": {
        "parser": "string"
      }, 
      "query": {
        "parser": "string"
      }, 
      "reference": {
        "next": "ResourceReference"
      }, 
      "role": {
        "parser": "string"
      }, 
      "sensitivity": {
        "next": "CodeableConcept"
      }, 
      "type": {
        "parser": "string"
      }
    }
  }, 
  "SecurityEvent.object.detail": {
    "edges": {
      "type": {
        "parser": "string"
      }, 
      "value": {
        "parser": "string"
      }
    }
  }, 
  "SecurityEvent.participant": {
    "edges": {
      "authId": {
        "parser": "string"
      }, 
      "media": {
        "next": "Coding"
      }, 
      "name": {
        "parser": "string"
      }, 
      "network": {
        "next": "SecurityEvent.participant.network"
      }, 
      "reference": {
        "next": "ResourceReference"
      }, 
      "requestor": {
        "parser": "boolean"
      }, 
      "role": {
        "next": "CodeableConcept"
      }, 
      "userId": {
        "parser": "string"
      }
    }
  }, 
  "SecurityEvent.participant.network": {
    "edges": {
      "identifier": {
        "parser": "string"
      }, 
      "type": {
        "parser": "string"
      }
    }
  }, 
  "SecurityEvent.source": {
    "edges": {
      "identifier": {
        "parser": "string"
      }, 
      "site": {
        "parser": "string"
      }, 
      "type": {
        "next": "Coding"
      }
    }
  }, 
  "Specimen": {
    "edges": {
      "accessionIdentifier": {
        "next": "Identifier"
      }, 
      "collection": {
        "next": "Specimen.collection"
      }, 
      "contained": {
        "next": "Resource"
      }, 
      "container": {
        "next": "Specimen.container"
      }, 
      "extension": {
        "next": "Extension"
      }, 
      "identifier": {
        "next": "Identifier"
      }, 
      "receivedTime": {
        "parser": "date"
      }, 
      "source": {
        "next": "Specimen.source"
      }, 
      "subject": {
        "next": "ResourceReference"
      }, 
      "text": {
        "next": "Narrative"
      }, 
      "treatment": {
        "next": "Specimen.treatment"
      }, 
      "type": {
        "next": "CodeableConcept"
      }
    }
  }, 
  "Specimen.collection": {
    "edges": {
      "collectedTime": {
        "parser": "date"
      }, 
      "collector": {
        "next": "ResourceReference"
      }, 
      "comment": {
        "parser": "string"
      }, 
      "method": {
        "next": "CodeableConcept"
      }, 
      "quantity": {
        "next": "Quantity"
      }, 
      "sourceSite": {
        "next": "CodeableConcept"
      }
    }
  }, 
  "Specimen.container": {
    "edges": {
      "additive": {
        "next": "ResourceReference"
      }, 
      "capacity": {
        "next": "Quantity"
      }, 
      "description": {
        "parser": "string"
      }, 
      "identifier": {
        "next": "Identifier"
      }, 
      "specimenQuantity": {
        "next": "Quantity"
      }, 
      "type": {
        "next": "CodeableConcept"
      }
    }
  }, 
  "Specimen.source": {
    "edges": {
      "relationship": {
        "parser": "string"
      }, 
      "target": {
        "next": "ResourceReference"
      }
    }
  }, 
  "Specimen.treatment": {
    "edges": {
      "additive": {
        "next": "ResourceReference"
      }, 
      "description": {
        "parser": "string"
      }, 
      "procedure": {
        "next": "CodeableConcept"
      }
    }
  }, 
  "Substance": {
    "edges": {
      "contained": {
        "next": "Resource"
      }, 
      "description": {
        "parser": "string"
      }, 
      "effectiveTime": {
        "next": "Period"
      }, 
      "extension": {
        "next": "Extension"
      }, 
      "identifier": {
        "next": "Identifier"
      }, 
      "ingredient": {
        "next": "ResourceReference"
      }, 
      "name": {
        "parser": "string"
      }, 
      "quantity": {
        "next": "Quantity"
      }, 
      "quantityMode": {
        "next": "CodeableConcept"
      }, 
      "status": {
        "next": "CodeableConcept"
      }, 
      "text": {
        "next": "Narrative"
      }, 
      "type": {
        "next": "CodeableConcept"
      }
    }
  }, 
  "Supply": {
    "edges": {
      "contained": {
        "next": "Resource"
      }, 
      "dispense": {
        "next": "Supply.dispense"
      }, 
      "extension": {
        "next": "Extension"
      }, 
      "identifier": {
        "next": "Identifier"
      }, 
      "name": {
        "next": "CodeableConcept"
      }, 
      "orderedItem": {
        "next": "ResourceReference"
      }, 
      "patient": {
        "next": "ResourceReference"
      }, 
      "status": {
        "parser": "string"
      }, 
      "text": {
        "next": "Narrative"
      }
    }
  }, 
  "Supply.dispense": {
    "edges": {
      "destination": {
        "next": "ResourceReference"
      }, 
      "identifier": {
        "next": "Identifier"
      }, 
      "quantity": {
        "next": "Quantity"
      }, 
      "receiver": {
        "next": "ResourceReference"
      }, 
      "status": {
        "parser": "string"
      }, 
      "suppliedItem": {
        "next": "ResourceReference"
      }, 
      "supplier": {
        "next": "ResourceReference"
      }, 
      "type": {
        "next": "CodeableConcept"
      }, 
      "whenHandedOver": {
        "next": "Period"
      }, 
      "whenPrepared": {
        "next": "Period"
      }
    }
  }, 
  "ValueSet": {
    "edges": {
      "compose": {
        "next": "ValueSet.compose"
      }, 
      "contained": {
        "next": "Resource"
      }, 
      "copyright": {
        "parser": "string"
      }, 
      "date": {
        "parser": "date"
      }, 
      "define": {
        "next": "ValueSet.define"
      }, 
      "description": {
        "parser": "string"
      }, 
      "expansion": {
        "next": "ValueSet.expansion"
      }, 
      "experimental": {
        "parser": "boolean"
      }, 
      "extension": {
        "next": "Extension"
      }, 
      "identifier": {
        "parser": "string"
      }, 
      "name": {
        "parser": "string"
      }, 
      "publisher": {
        "parser": "string"
      }, 
      "status": {
        "parser": "string"
      }, 
      "telecom": {
        "next": "Contact"
      }, 
      "text": {
        "next": "Narrative"
      }, 
      "version": {
        "parser": "string"
      }
    }
  }, 
  "ValueSet.compose": {
    "edges": {
      "exclude": {
        "next": "ValueSet.compose.include"
      }, 
      "import": {
        "parser": "string"
      }, 
      "include": {
        "next": "ValueSet.compose.include"
      }
    }
  }, 
  "ValueSet.compose.include": {
    "edges": {
      "code": {
        "parser": "string"
      }, 
      "filter": {
        "next": "ValueSet.compose.include.filter"
      }, 
      "system": {
        "parser": "string"
      }, 
      "version": {
        "parser": "string"
      }
    }
  }, 
  "ValueSet.compose.include.filter": {
    "edges": {
      "op": {
        "parser": "string"
      }, 
      "property": {
        "parser": "string"
      }, 
      "value": {
        "parser": "string"
      }
    }
  }, 
  "ValueSet.define": {
    "edges": {
      "caseSensitive": {
        "parser": "boolean"
      }, 
      "concept": {
        "next": "ValueSet.define.concept"
      }, 
      "system": {
        "parser": "string"
      }
    }
  }, 
  "ValueSet.define.concept": {
    "edges": {
      "abstract": {
        "parser": "boolean"
      }, 
      "code": {
        "parser": "string"
      }, 
      "concept": {
        "next": "ValueSet.define.concept"
      }, 
      "definition": {
        "parser": "string"
      }, 
      "display": {
        "parser": "string"
      }
    }
  }, 
  "ValueSet.expansion": {
    "edges": {
      "contains": {
        "next": "ValueSet.expansion.contains"
      }, 
      "timestamp": {
        "parser": "date"
      }
    }
  }, 
  "ValueSet.expansion.contains": {
    "edges": {
      "code": {
        "parser": "string"
      }, 
      "contains": {
        "next": "ValueSet.expansion.contains"
      }, 
      "display": {
        "parser": "string"
      }, 
      "system": {
        "parser": "string"
      }
    }
  }
}

},{}]},{},[2])(2)
});
;