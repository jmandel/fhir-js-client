import * as jose from "jose";
declare const base64urlencode: (input: Uint8Array | string) => string;
declare const base64urldecode: (input: Uint8Array | string) => Uint8Array;
export { base64urldecode, base64urlencode };
export declare const digestSha256: (payload: string | ArrayBuffer) => Promise<Uint8Array>;
export declare const randomBytes: (count: number) => Uint8Array;
export declare const generatePKCEChallenge: (entropy?: number) => Promise<{
    codeChallenge: string;
    codeVerifier: string;
}>;
declare type SupportedAlg = 'ES384' | 'RS384';
export declare const importKey: (jwk: {
    alg: SupportedAlg;
}) => Promise<jose.KeyLike>;
export declare const signCompactJws: (alg: SupportedAlg, privateKey: jose.KeyLike, header: any, payload: any) => Promise<string>;
