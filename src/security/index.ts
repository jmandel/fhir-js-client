import base64url from 'base64url'


declare var IS_BROWSER: boolean;
let wcrypto: SubtleCrypto;
let cryptoRandomBytes: (count: number) => Uint8Array;

if (typeof IS_BROWSER == 'undefined') {
  wcrypto =  require('crypto').webcrypto.subtle
  cryptoRandomBytes = require('crypto').randomBytes
} else {
  wcrypto = window.crypto.subtle
}

export const digestSha256 = async (payload: string | ArrayBuffer) => {
  let prepared: ArrayBuffer;

  if (typeof payload === 'string') {
    const encoder = new TextEncoder();
    prepared = encoder.encode(payload).buffer;
  } else {
      prepared = payload
  }

  const hash = await wcrypto.digest('SHA-256', prepared);
  return hash;
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
  const codeVerifier = base64url.encode(inputBytes as Buffer);
  const codeChallenge = new TextDecoder().decode(await digestSha256(codeVerifier));
  return {codeChallenge, codeVerifier}
}

type JWSAlg = 'ES384' | 'RS384'
const algs: Record<JWSAlg, RsaHashedKeyGenParams | EcKeyGenParams> = {
     "ES384":{name: "ECDSA", namedCurve: "P-384"} ,
     "RS384": {name: "RSASSA-PKCS1-v1_5", modulusLength: 4096, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-384'}
 }

const generateKey = async (jwsAlg: JWSAlg): Promise<CryptoKeyPair> =>
    wcrypto.generateKey(algs[jwsAlg], true, ["sign"]) as unknown as CryptoKeyPair

export const importKey = async (jwk: {alg: JWSAlg}): Promise<CryptoKey> =>
    wcrypto.importKey("jwk", jwk, algs[jwk.alg], true, ['sign'])

export const signCompactJws = async (privateKey: CryptoKey, header: any, payload: any): Promise<string> => {
    const jwsAlgs = Object.entries(algs).filter(([k, v]) => v.name=== privateKey.algorithm.name).map(([k,v]) => k);
    if (jwsAlgs.length !== 1) {
        throw "No JWS alg for " + privateKey.algorithm.name
    }

    const jwtHeader = JSON.stringify({...header, alg: jwsAlgs[0]});
    const jwtPayload = JSON.stringify(payload);
    const jwtAuthenticatedContent = `${base64url.encode(jwtHeader)}.${base64url.encode(jwtPayload)}`;

    const signature = (await wcrypto.sign({
        ...privateKey.algorithm,
        hash: 'SHA-384'},
        privateKey,
        Buffer.from(jwtAuthenticatedContent)))

    const jwt = `${jwtAuthenticatedContent}.${base64url.encode(Buffer.from(signature))}`
    return jwt
}

// TODO: replace with a library that decodes to a byte array or similar rather than a string
export const base64urlencode = (v: Uint8Array | Buffer): string => base64url.encode(v as Buffer)
export const base64urldecode = (v: string): Uint8Array => Buffer.from(base64url.decode(v))

async function test(){
    const esk = await generateKey('ES384');
    console.log(await signCompactJws(esk.privateKey!, {'jwku': 'sure'}, {iss: "issuer"}))
    const publicJwk = await wcrypto.exportKey("jwk", esk.publicKey!);
    console.log(JSON.stringify(publicJwk))

    const rsk = await generateKey('RS384');
    console.log(await signCompactJws(rsk.privateKey!, {'jwku': 'sure'}, {iss: "issuer"}))
    const publicJwkR = await wcrypto.exportKey("jwk", rsk.publicKey!);
    console.log(JSON.stringify(publicJwkR))
}