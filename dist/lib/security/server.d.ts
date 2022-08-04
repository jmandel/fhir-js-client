/// <reference types="node" />
import { KeyLike, GenerateKeyPairResult } from "jose";
import { randomBytes } from "crypto";
interface PkcePair {
    codeChallenge: string;
    codeVerifier: string;
}
declare type SupportedAlg = 'ES384' | 'RS384';
export declare const base64urlencode: (input: Uint8Array | string) => string;
export declare const base64urldecode: (input: Uint8Array | string) => string;
export { randomBytes };
export declare function digestSha256(payload: string | Buffer): Promise<Buffer>;
export declare function generatePKCEChallenge(entropy?: number): Promise<PkcePair>;
export declare function generateKey(jwsAlg: SupportedAlg): Promise<GenerateKeyPairResult>;
export declare function importKey(jwk: {
    alg: SupportedAlg;
}): Promise<KeyLike>;
export declare function exportKey(key: CryptoKey): Promise<import("jose").JWK>;
export declare function signCompactJws(alg: SupportedAlg, privateKey: KeyLike, header: any, payload: any): Promise<string>;
