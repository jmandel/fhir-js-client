import { encodeURL, decode, fromUint8Array } from "js-base64"
const crypto: Crypto = require("isomorphic-webcrypto").default
const subtle: SubtleCrypto = crypto.subtle

interface PkcePair {
    codeChallenge: string
    codeVerifier: string
}

const ALGS = {
    ES384: {
        name: "ECDSA",
        namedCurve: "P-384"
    } as EcKeyGenParams,
    RS384: {
        name: "RSASSA-PKCS1-v1_5",
        modulusLength: 4096,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: {
            name: 'SHA-384'
        }
    } as RsaHashedKeyGenParams
};

export const base64urlencode = (input: Uint8Array | string) => {
    if (typeof input == "string") {
        return encodeURL(input)
    }
    return fromUint8Array(input, true)
}

export const base64urldecode = decode

export function randomBytes(count: number): Uint8Array {
    return crypto.getRandomValues(new Uint8Array(count));
}

export async function digestSha256(payload: string) {
    const prepared: ArrayBuffer = new Uint8Array(s2b(payload));
    const hash = await subtle.digest('SHA-256', prepared);
    return new Uint8Array(hash);
}

export const generatePKCEChallenge = async (entropy = 96): Promise<PkcePair> => {
    const inputBytes    = randomBytes(entropy)
    const codeVerifier  = base64urlencode(inputBytes as Buffer)
    const codeChallenge = base64urlencode(await digestSha256(codeVerifier) as Buffer)
    return { codeChallenge, codeVerifier }
}

export async function generateKey(jwsAlg: keyof typeof ALGS): Promise<CryptoKeyPair> {
    try {
        return await subtle.generateKey(ALGS[jwsAlg], true, ["sign"])
    } catch (e) {
        throw new Error(`The ${jwsAlg} is not supported by this browser: ${e}`)
    }
}

export async function importKey(jwk: {alg: keyof typeof ALGS, [key: string]: any}): Promise<CryptoKey> {
    try {
        return await subtle.importKey("jwk", jwk, ALGS[jwk.alg], true, ['sign'])
    } catch (e) {
        throw new Error(`The ${jwk.alg} is not supported by this browser: ${e}`)
    }
}

export async function signCompactJws(privateKey: CryptoKey, header: any, payload: any): Promise<string> {

    const jwsAlgs = Object.entries(ALGS).filter(([,v]) => v.name === privateKey.algorithm.name).map(([k]) => k);

    if (jwsAlgs.length !== 1) {
        throw "No JWS alg for " + privateKey.algorithm.name
    }

    const jwtHeader  = JSON.stringify({...header, alg: jwsAlgs[0]});
    const jwtPayload = JSON.stringify(payload);
    const jwtAuthenticatedContent = `${base64urlencode(jwtHeader)}.${base64urlencode(jwtPayload)}`;

    const signature = await subtle.sign(
        { ...privateKey.algorithm, hash: 'SHA-384' },
        privateKey,
        s2b(jwtAuthenticatedContent)
    );

    return `${jwtAuthenticatedContent}.${base64urlencode(signature as Uint8Array)}`
}

function s2b ( s: string ) {
    var b = new Uint8Array(s.length);
    for ( var i = 0; i < s.length; i++ ) b[i] = s.charCodeAt(i);
    return b;
}

