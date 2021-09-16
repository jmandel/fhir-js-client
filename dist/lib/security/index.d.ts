/// <reference types="node" />
export declare const digestSha256: (payload: string | ArrayBuffer) => Promise<ArrayBuffer>;
export declare const randomBytes: (count: number) => Uint8Array;
export declare const generatePKCEChallenge: (entropy?: number) => Promise<{
    codeChallenge: string;
    codeVerifier: string;
}>;
declare type JWSAlg = 'ES384' | 'RS384';
export declare const importKey: (jwk: {
    alg: JWSAlg;
}) => Promise<CryptoKey>;
export declare const signCompactJws: (privateKey: CryptoKey, header: any, payload: any) => Promise<string>;
export declare const base64urlencode: (v: Uint8Array | Buffer | ArrayBuffer) => string;
export declare const base64urldecode: (v: string) => Uint8Array;
export {};
