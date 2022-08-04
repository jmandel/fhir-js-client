"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.signCompactJws = exports.exportKey = exports.importKey = exports.generateKey = exports.generatePKCEChallenge = exports.digestSha256 = exports.randomBytes = exports.base64urldecode = exports.base64urlencode = void 0;

const jose_1 = require("jose");

const crypto_1 = require("crypto");

Object.defineProperty(exports, "randomBytes", {
  enumerable: true,
  get: function () {
    return crypto_1.randomBytes;
  }
});

const base64urlencode = input => jose_1.base64url.encode(input);

exports.base64urlencode = base64urlencode;

const base64urldecode = input => jose_1.base64url.decode(input).toString();

exports.base64urldecode = base64urldecode;

async function digestSha256(payload) {
  const hash = (0, crypto_1.createHash)('sha256');
  hash.update(payload);
  return hash.digest();
}

exports.digestSha256 = digestSha256;

async function generatePKCEChallenge(entropy = 96) {
  const inputBytes = (0, crypto_1.randomBytes)(entropy);
  const codeVerifier = (0, exports.base64urlencode)(inputBytes);
  const codeChallenge = (0, exports.base64urlencode)(await digestSha256(codeVerifier));
  return {
    codeChallenge,
    codeVerifier
  };
}

exports.generatePKCEChallenge = generatePKCEChallenge;

async function generateKey(jwsAlg) {
  return (0, jose_1.generateKeyPair)(jwsAlg, {
    extractable: true
  });
}

exports.generateKey = generateKey;

async function importKey(jwk) {
  return (0, jose_1.importJWK)(jwk);
}

exports.importKey = importKey;

async function exportKey(key) {
  return (0, jose_1.exportJWK)(key);
}

exports.exportKey = exportKey;

async function signCompactJws(alg, privateKey, header, payload) {
  return new jose_1.SignJWT(payload).setProtectedHeader(Object.assign(Object.assign({}, header), {
    alg
  })).sign(privateKey);
}

exports.signCompactJws = signCompactJws;

async function test() {
  const esk = await generateKey('ES384');
  console.log("ES384 privateKey:", esk.privateKey);
  const eskSigned = await new jose_1.SignJWT({
    iss: "issuer"
  }).setProtectedHeader({
    alg: 'ES384',
    jwku: "test"
  }).sign(esk.privateKey);
  console.log("Signed ES384", eskSigned);
  console.log(JSON.stringify(await (0, jose_1.exportJWK)(esk.publicKey)));
  const rsk = await generateKey('RS384');
  console.log("RS384 privateKey:", rsk.privateKey);
  const rskSigned = await new jose_1.SignJWT({
    iss: "issuer"
  }).setProtectedHeader({
    alg: 'RS384',
    jwku: "test"
  }).sign(rsk.privateKey);
  console.log("Signed RS384", rskSigned);
  console.log(JSON.stringify(await (0, jose_1.exportJWK)(rsk.publicKey)));
} // test()