import { encodeURL, decode, fromUint8Array } from "js-base64"
import { fhirclient } from "../types"
const crypto: Crypto = global.crypto || require("isomorphic-webcrypto").default
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

export const base64urlencode = (input: string | Uint8Array) => {
    if (typeof input == "string") {
        return encodeURL(input)
    }
    return fromUint8Array(input, true)
}

export const base64urldecode = (input: string) => {
    return decode(input)
}

export function randomBytes(count: number): Uint8Array {
    return crypto.getRandomValues(new Uint8Array(count));
}

export async function digestSha256(payload: string): Promise<Uint8Array> {
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

export async function importJWK(jwk: fhirclient.JWK): Promise<CryptoKey> {
    // alg is optional in JWK but we need it here!
    if (!jwk.alg) {
        throw new Error('The "alg" property of the JWK must be set to "ES384" or "RS384"')
    }

    // Use of the "key_ops" member is OPTIONAL, unless the application requires its presence.
    // https://www.rfc-editor.org/rfc/rfc7517.html#section-4.3
    // 
    // In our case the app will only import private keys so we can assume "sign"
    if (!Array.isArray(jwk.key_ops)) {
        jwk.key_ops = ["sign"]
    }

    // In this case the JWK has a "key_ops" array and "sign" is not listed
    if (!jwk.key_ops.includes("sign")) {
        throw new Error('The "key_ops" property of the JWK does not contain "sign"')
    }

    try {
        return await subtle.importKey(
            "jwk",
            jwk,
            ALGS[jwk.alg],
            jwk.ext === true,
            jwk.key_ops// || ['sign']
        )
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

