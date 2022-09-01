/// <reference types="node" />
import { KeyLike } from "jose";
import { randomBytes } from "crypto";
import { fhirclient } from "../types";
interface PkcePair {
    codeChallenge: string;
    codeVerifier: string;
}
declare type SupportedAlg = 'ES384' | 'RS384';
export { randomBytes };
export declare function digestSha256(payload: string): Promise<Buffer>;
export declare function generatePKCEChallenge(entropy?: number): Promise<PkcePair>;
export declare function importJWK(jwk: fhirclient.JWK): Promise<CryptoKey>;
export declare function signCompactJws(alg: SupportedAlg, privateKey: KeyLike, header: any, payload: any): Promise<string>;
