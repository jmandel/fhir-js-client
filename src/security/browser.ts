import { encodeURL, decode, fromUint8Array } from "js-base64"
import { fhirclient } from "../types"
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
    const codeVerifier  = base64urlencode(inputBytes)
    const codeChallenge = base64urlencode(await digestSha256(codeVerifier))
    return { codeChallenge, codeVerifier }
}

export async function generateKey(jwsAlg: keyof typeof ALGS): Promise<CryptoKeyPair> {
    try {
        return await subtle.generateKey(ALGS[jwsAlg], true, ["sign"])
    } catch (e) {
        throw new Error(`The ${jwsAlg} is not supported by this browser: ${e}`)
    }
}

export async function importKey(jwk: fhirclient.JWK): Promise<CryptoKey> {
    try {
        return await subtle.importKey("jwk", jwk, ALGS[jwk.alg], true, ['sign'])
    } catch (e) {
        throw new Error(`The ${jwk.alg} is not supported by this browser: ${e}`)
    }
}

export async function signCompactJws(alg: keyof typeof ALGS, privateKey: CryptoKey, header: any, payload: any): Promise<string> {

    const jwtHeader  = JSON.stringify({ ...header, alg });
    const jwtPayload = JSON.stringify(payload);
    const jwtAuthenticatedContent = `${base64urlencode(jwtHeader)}.${base64urlencode(jwtPayload)}`;

    const signature = await subtle.sign(
        { ...privateKey.algorithm, hash: 'SHA-384' },
        privateKey,
        s2b(jwtAuthenticatedContent)
    );

    return `${jwtAuthenticatedContent}.${fromUint8Array(new Uint8Array(signature))}`
}

function s2b ( s: string ) {
    const b = new Uint8Array(s.length);
    const bs = utf8ToBinaryString(s)
    for ( var i = 0; i < bs.length; i++ ) b[i] = bs.charCodeAt(i);
    return b;
}

// UTF-8 to Binary String
// Source: https://coolaj86.com/articles/sign-jwt-webcrypto-vanilla-js/
// Because JavaScript has a strange relationship with strings
// https://coolaj86.com/articles/base64-unicode-utf-8-javascript-and-you/
function utf8ToBinaryString(str: string) {
    // replaces any uri escape sequence, such as %0A, with binary escape, such as 0x0A
    return encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, function(_, p1) {
        return String.fromCharCode(parseInt(p1, 16));
    });
}

