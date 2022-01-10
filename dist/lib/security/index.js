"use strict";

require("core-js/modules/es.typed-array.sort.js");

var _a;

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.base64urldecode = exports.base64urlencode = exports.signCompactJws = exports.importKey = exports.generatePKCEChallenge = exports.randomBytes = exports.digestSha256 = void 0;

const base64url_1 = require("base64url");

let wcrypto;
let cryptoRandomBytes;

if (typeof IS_BROWSER == 'undefined' && (typeof window === 'undefined' || !((_a = window === null || window === void 0 ? void 0 : window.crypto) === null || _a === void 0 ? void 0 : _a.subtle))) {
  wcrypto = require('crypto').webcrypto.subtle;
  cryptoRandomBytes = require('crypto').randomBytes;
} else {
  wcrypto = window.crypto.subtle;
}

exports.digestSha256 = async payload => {
  let prepared;

  if (typeof payload === 'string') {
    const encoder = new TextEncoder();
    prepared = encoder.encode(payload).buffer;
  } else {
    prepared = payload;
  }

  const hash = await wcrypto.digest('SHA-256', prepared);
  return hash;
};

exports.randomBytes = count => {
  var _a;

  if (typeof window !== 'undefined' && ((_a = window === null || window === void 0 ? void 0 : window.crypto) === null || _a === void 0 ? void 0 : _a.getRandomValues)) {
    return window.crypto.getRandomValues(new Uint8Array(count));
  } else {
    return cryptoRandomBytes(count);
  }
};

const RECOMMENDED_CODE_VERIFIER_ENTROPY = 96;

exports.generatePKCEChallenge = async (entropy = RECOMMENDED_CODE_VERIFIER_ENTROPY) => {
  const inputBytes = exports.randomBytes(entropy);
  const codeVerifier = exports.base64urlencode(inputBytes);
  const codeChallenge = exports.base64urlencode(await exports.digestSha256(codeVerifier));
  return {
    codeChallenge,
    codeVerifier
  };
};

const algs = {
  "ES384": {
    name: "ECDSA",
    namedCurve: "P-384"
  },
  "RS384": {
    name: "RSASSA-PKCS1-v1_5",
    modulusLength: 4096,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: 'SHA-384'
  }
};

const generateKey = async jwsAlg => wcrypto.generateKey(algs[jwsAlg], true, ["sign"]);

exports.importKey = async jwk => wcrypto.importKey("jwk", jwk, algs[jwk.alg], true, ['sign']);

exports.signCompactJws = async (privateKey, header, payload) => {
  const jwsAlgs = Object.entries(algs).filter(([k, v]) => v.name === privateKey.algorithm.name).map(([k, v]) => k);

  if (jwsAlgs.length !== 1) {
    throw "No JWS alg for " + privateKey.algorithm.name;
  }

  const jwtHeader = JSON.stringify(Object.assign(Object.assign({}, header), {
    alg: jwsAlgs[0]
  }));
  const jwtPayload = JSON.stringify(payload);
  const jwtAuthenticatedContent = `${base64url_1.default.encode(jwtHeader)}.${base64url_1.default.encode(jwtPayload)}`;
  const signature = await wcrypto.sign(Object.assign(Object.assign({}, privateKey.algorithm), {
    hash: 'SHA-384'
  }), privateKey, Buffer.from(jwtAuthenticatedContent));
  const jwt = `${jwtAuthenticatedContent}.${base64url_1.default.encode(Buffer.from(signature))}`;
  return jwt;
}; // TODO: replace with a library that decodes to a byte array or similar rather than a string


exports.base64urlencode = v => base64url_1.default.encode(Buffer.from(v));

exports.base64urldecode = v => Buffer.from(base64url_1.default.decode(v));

async function test() {
  const esk = await generateKey('ES384');
  console.log(await exports.signCompactJws(esk.privateKey, {
    'jwku': 'sure'
  }, {
    iss: "issuer"
  }));
  const publicJwk = await wcrypto.exportKey("jwk", esk.publicKey);
  console.log(JSON.stringify(publicJwk));
  const rsk = await generateKey('RS384');
  console.log(await exports.signCompactJws(rsk.privateKey, {
    'jwku': 'sure'
  }, {
    iss: "issuer"
  }));
  const publicJwkR = await wcrypto.exportKey("jwk", rsk.publicKey);
  console.log(JSON.stringify(publicJwkR));
}