"use strict";

require("core-js/modules/es.typed-array.sort.js");

var _a;

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.signCompactJws = exports.importKey = exports.generatePKCEChallenge = exports.randomBytes = exports.digestSha256 = exports.base64urlencode = exports.base64urldecode = void 0;

const jose = require("jose");

const base64urlencode = jose.base64url.encode;
exports.base64urlencode = base64urlencode;
const base64urldecode = jose.base64url.decode;
exports.base64urldecode = base64urldecode;
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
  return new Uint8Array(hash);
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
  const codeVerifier = base64urlencode(inputBytes);
  const codeChallenge = base64urlencode(await exports.digestSha256(codeVerifier));
  return {
    codeChallenge,
    codeVerifier
  };
};

const generateKey = async jwsAlg => jose.generateKeyPair(jwsAlg, {
  extractable: true
});

exports.importKey = async jwk => jose.importJWK(jwk);

exports.signCompactJws = async (alg, privateKey, header, payload) => {
  return new jose.SignJWT(payload).setProtectedHeader(Object.assign(Object.assign({}, header), {
    alg
  })).sign(privateKey);
};

async function test() {
  const esk = await generateKey('ES384');
  console.log("Signed ES384", esk.privateKey);
  const eskSigned = await new jose.SignJWT({
    iss: "issuer"
  }).setProtectedHeader({
    alg: 'ES384',
    jwku: "test"
  }).sign(esk.privateKey);
  console.log("Signed ES384", eskSigned);
  console.log(JSON.stringify(await jose.exportJWK(esk.publicKey)));
  const rsk = await generateKey('RS384');
  const rskSigned = await new jose.SignJWT({
    iss: "issuer"
  }).setProtectedHeader({
    alg: 'RS384',
    jwku: "test"
  }).sign(rsk.privateKey);
  console.log("Signed RS384", rskSigned);
  console.log(JSON.stringify(await jose.exportJWK(rsk.publicKey)));
}