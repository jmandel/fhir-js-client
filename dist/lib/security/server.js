"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.signCompactJws = exports.importJWK = exports.generatePKCEChallenge = exports.digestSha256 = exports.randomBytes = exports.base64urldecode = exports.base64urlencode = void 0;

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

async function importJWK(jwk) {
  return (0, jose_1.importJWK)(jwk);
}

exports.importJWK = importJWK;

async function signCompactJws(alg, privateKey, header, payload) {
  return new jose_1.SignJWT(payload).setProtectedHeader(Object.assign(Object.assign({}, header), {
    alg
  })).sign(privateKey);
}

exports.signCompactJws = signCompactJws; // async function test(){
//     const { generateKeyPair } = require("jose")
//     const esk = await generateKeyPair("ES384", { extractable: true });
//     console.log("ES384 privateKey:", esk.privateKey);
//     const eskSigned = await new SignJWT({ iss: "issuer" }).setProtectedHeader({ alg: 'ES384', jwku: "test" }).sign(esk.privateKey);
//     console.log("Signed ES384", eskSigned);
//     console.log(JSON.stringify(await exportJWK(esk.publicKey)))
//     const rsk = await generateKeyPair('RS384', { extractable: true });
//     console.log("RS384 privateKey:", rsk.privateKey);
//     const rskSigned = await new SignJWT({ iss: "issuer" }).setProtectedHeader({ alg: 'RS384', jwku: "test" }).sign(rsk.privateKey);
//     console.log("Signed RS384", rskSigned);
//     console.log(JSON.stringify(await exportJWK(rsk.publicKey)))
// }
// test()