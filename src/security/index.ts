import * as jose from "jose";

const base64urlencode: (input: Uint8Array | string)=> string = jose.base64url.encode;
const base64urldecode: (input: Uint8Array | string)=> Uint8Array= jose.base64url.decode;

export {
  base64urldecode, base64urlencode
}


declare var IS_BROWSER: boolean;
let wCrypto: SubtleCrypto;
let cryptoRandomBytes: (count: number) => Uint8Array;

if (typeof IS_BROWSER == 'undefined' && (typeof window === 'undefined' || !window?.crypto?.subtle)) {
  wCrypto =  require('crypto').webcrypto.subtle
  cryptoRandomBytes = require('crypto').randomBytes
} else {
  wCrypto = window.crypto.subtle
}

export const digestSha256 = async (payload: string | ArrayBuffer) => {
  let prepared: ArrayBuffer;

  if (typeof payload === 'string') {
    const encoder = new TextEncoder();
    prepared = encoder.encode(payload).buffer;
  } else {
      prepared = payload
  }

  const hash = await wCrypto.digest('SHA-256', prepared);
  return new Uint8Array(hash);
}

export const randomBytes = (count: number): Uint8Array => {
  if (typeof window !== 'undefined' && window?.crypto?.getRandomValues) {
    return window.crypto.getRandomValues(new Uint8Array(count));
  } else {
    return cryptoRandomBytes(count);
  }
}

const RECOMMENDED_CODE_VERIFIER_ENTROPY = 96;
export const generatePKCEChallenge = async (entropy = RECOMMENDED_CODE_VERIFIER_ENTROPY):Promise<{codeChallenge: string, codeVerifier: string}> =>  {
  const inputBytes = randomBytes(entropy);
  const codeVerifier = base64urlencode(inputBytes);
  const codeChallenge = base64urlencode(await digestSha256(codeVerifier));
  return {codeChallenge, codeVerifier}
}

type SupportedAlg = 'ES384' | 'RS384'
const generateKey = async (jwsAlg: SupportedAlg): Promise<jose.GenerateKeyPairResult> => jose.generateKeyPair(jwsAlg, {extractable: true})

export const importKey = async (jwk: {alg: SupportedAlg}): Promise<jose.KeyLike> => jose.importJWK(jwk) as Promise<jose.KeyLike>

export const signCompactJws = async (alg: SupportedAlg, privateKey: jose.KeyLike, header: any, payload: any): Promise<string> => {
  return new jose.SignJWT(payload).setProtectedHeader({...header, alg}).sign(privateKey)
}


async function test(){
    const esk = await generateKey('ES384');
    console.log("Signed ES384", esk.privateKey);
    const eskSigned = await new jose.SignJWT({
      iss: "issuer"
    }).setProtectedHeader({alg: 'ES384', jwku: "test"})
    .sign(esk.privateKey);
    console.log("Signed ES384", eskSigned);
    console.log(JSON.stringify(await jose.exportJWK(esk.publicKey)))

    const rsk = await generateKey('RS384');
    const rskSigned = await new jose.SignJWT({
      iss: "issuer"
    }).setProtectedHeader({alg: 'RS384', jwku: "test"})
    .sign(rsk.privateKey);
    console.log("Signed RS384", rskSigned);
    console.log(JSON.stringify(await jose.exportJWK(rsk.publicKey)))

}