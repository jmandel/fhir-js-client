interface PkcePair {
    codeChallenge: string;
    codeVerifier: string;
}
declare const ALGS: {
    ES384: EcKeyGenParams;
    RS384: RsaHashedKeyGenParams;
};
export declare const base64urlencode: (input: Uint8Array | string) => string;
export declare const base64urldecode: (src: string) => string;
export declare function randomBytes(count: number): Uint8Array;
export declare function digestSha256(payload: string): Promise<Uint8Array>;
export declare const generatePKCEChallenge: (entropy?: number) => Promise<PkcePair>;
export declare function generateKey(jwsAlg: keyof typeof ALGS): Promise<CryptoKeyPair>;
export declare function importKey(jwk: {
    alg: keyof typeof ALGS;
    [key: string]: any;
}): Promise<CryptoKey>;
export declare function signCompactJws(privateKey: CryptoKey, header: any, payload: any): Promise<string>;
export {};
