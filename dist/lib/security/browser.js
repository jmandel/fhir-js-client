"use strict";

require("core-js/modules/es.typed-array.set.js");

require("core-js/modules/es.typed-array.sort.js");

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.signCompactJws = exports.importKey = exports.generateKey = exports.generatePKCEChallenge = exports.digestSha256 = exports.randomBytes = exports.base64urldecode = exports.base64urlencode = void 0;

const js_base64_1 = require("js-base64");

const crypto = require("isomorphic-webcrypto").default;

const subtle = crypto.subtle;
const ALGS = {
  ES384: {
    name: "ECDSA",
    namedCurve: "P-384"
  },
  RS384: {
    name: "RSASSA-PKCS1-v1_5",
    modulusLength: 4096,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: {
      name: 'SHA-384'
    }
  }
};

const base64urlencode = input => {
  if (typeof input == "string") {
    return (0, js_base64_1.encodeURL)(input);
  }

  return (0, js_base64_1.fromUint8Array)(input, true);
};

exports.base64urlencode = base64urlencode;
exports.base64urldecode = js_base64_1.decode;

function randomBytes(count) {
  return crypto.getRandomValues(new Uint8Array(count));
}

exports.randomBytes = randomBytes;

async function digestSha256(payload) {
  const prepared = new Uint8Array(s2b(payload));
  const hash = await subtle.digest('SHA-256', prepared);
  return new Uint8Array(hash);
}

exports.digestSha256 = digestSha256;

const generatePKCEChallenge = async (entropy = 96) => {
  const inputBytes = randomBytes(entropy);
  const codeVerifier = (0, exports.base64urlencode)(inputBytes);
  const codeChallenge = (0, exports.base64urlencode)(await digestSha256(codeVerifier));
  return {
    codeChallenge,
    codeVerifier
  };
};

exports.generatePKCEChallenge = generatePKCEChallenge;

async function generateKey(jwsAlg) {
  try {
    return await subtle.generateKey(ALGS[jwsAlg], true, ["sign"]);
  } catch (e) {
    throw new Error(`The ${jwsAlg} is not supported by this browser: ${e}`);
  }
}

exports.generateKey = generateKey;

async function importKey(jwk) {
  try {
    return await subtle.importKey("jwk", jwk, ALGS[jwk.alg], true, ['sign']);
  } catch (e) {
    throw new Error(`The ${jwk.alg} is not supported by this browser: ${e}`);
  }
}

exports.importKey = importKey;

async function signCompactJws(privateKey, header, payload) {
  const jwsAlgs = Object.entries(ALGS).filter(([, v]) => v.name === privateKey.algorithm.name).map(([k]) => k);

  if (jwsAlgs.length !== 1) {
    throw "No JWS alg for " + privateKey.algorithm.name;
  }

  const jwtHeader = JSON.stringify(Object.assign(Object.assign({}, header), {
    alg: jwsAlgs[0]
  }));
  const jwtPayload = JSON.stringify(payload);
  const jwtAuthenticatedContent = `${(0, exports.base64urlencode)(jwtHeader)}.${(0, exports.base64urlencode)(jwtPayload)}`;
  const signature = await subtle.sign(Object.assign(Object.assign({}, privateKey.algorithm), {
    hash: 'SHA-384'
  }), privateKey, s2b(jwtAuthenticatedContent));
  return `${jwtAuthenticatedContent}.${(0, exports.base64urlencode)(signature)}`;
}

exports.signCompactJws = signCompactJws;

function s2b(s) {
  var b = new Uint8Array(s.length);

  for (var i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);

  return b;
}