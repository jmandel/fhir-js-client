"use strict";

require("core-js/modules/es.typed-array.set.js");

require("core-js/modules/es.typed-array.sort.js");

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.signCompactJws = exports.importJWK = exports.generatePKCEChallenge = exports.digestSha256 = exports.randomBytes = exports.base64urldecode = exports.base64urlencode = void 0;

const js_base64_1 = require("js-base64");

const crypto = global.crypto || require("isomorphic-webcrypto").default;

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

const base64urldecode = input => {
  return (0, js_base64_1.decode)(input);
};

exports.base64urldecode = base64urldecode;

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

async function importJWK(jwk) {
  if (!jwk.alg) {
    throw new Error('The "alg" property of the JWK must be set to "ES384" or "RS384"');
  }

  if (!Array.isArray(jwk.key_ops)) {
    throw new Error('The "key_ops" property of the JWK must be an array containing "sign" or "verify" (or both)');
  }

  try {
    return await subtle.importKey("jwk", jwk, ALGS[jwk.alg], jwk.ext === true, jwk.key_ops // || ['sign']
    );
  } catch (e) {
    throw new Error(`The ${jwk.alg} is not supported by this browser: ${e}`);
  }
}

exports.importJWK = importJWK;

async function signCompactJws(alg, privateKey, header, payload) {
  const jwtHeader = JSON.stringify(Object.assign(Object.assign({}, header), {
    alg
  }));
  const jwtPayload = JSON.stringify(payload);
  const jwtAuthenticatedContent = `${(0, exports.base64urlencode)(jwtHeader)}.${(0, exports.base64urlencode)(jwtPayload)}`;
  const signature = await subtle.sign(Object.assign(Object.assign({}, privateKey.algorithm), {
    hash: 'SHA-384'
  }), privateKey, s2b(jwtAuthenticatedContent));
  return `${jwtAuthenticatedContent}.${(0, js_base64_1.fromUint8Array)(new Uint8Array(signature))}`;
}

exports.signCompactJws = signCompactJws;

function s2b(s) {
  const b = new Uint8Array(s.length);
  const bs = utf8ToBinaryString(s);

  for (var i = 0; i < bs.length; i++) b[i] = bs.charCodeAt(i);

  return b;
} // UTF-8 to Binary String
// Source: https://coolaj86.com/articles/sign-jwt-webcrypto-vanilla-js/
// Because JavaScript has a strange relationship with strings
// https://coolaj86.com/articles/base64-unicode-utf-8-javascript-and-you/


function utf8ToBinaryString(str) {
  // replaces any uri escape sequence, such as %0A, with binary escape, such as 0x0A
  return encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, function (_, p1) {
    return String.fromCharCode(parseInt(p1, 16));
  });
}