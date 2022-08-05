import {
  base64url,
  KeyLike,
  SignJWT,
  GenerateKeyPairResult,
  generateKeyPair,
  importJWK,
  exportJWK
} from "jose"
import {
  randomBytes,
  createHash
} from "crypto"


interface PkcePair {
    codeChallenge: string;
    codeVerifier: string;
}

declare const ALGS: {
    ES384: EcKeyGenParams;
    RS384: RsaHashedKeyGenParams;
};

type SupportedAlg = 'ES384' | 'RS384'

export const base64urlencode = (input: Uint8Array | string) => base64url.encode(input);
export const base64urldecode = (input: Uint8Array | string) => base64url.decode(input).toString();

export { randomBytes }

export async function digestSha256(payload: string | Buffer) {
    const hash = createHash('sha256')
    hash.update(payload)
    return hash.digest()
}

export async function generatePKCEChallenge(entropy = 96): Promise<PkcePair> {
    const inputBytes    = randomBytes(entropy)
    const codeVerifier  = base64urlencode(inputBytes)
    const codeChallenge = base64urlencode(await digestSha256(codeVerifier))
    return { codeChallenge, codeVerifier }
}

export async function generateKey(jwsAlg: SupportedAlg): Promise<GenerateKeyPairResult> {
    return generateKeyPair(jwsAlg, { extractable: true })
}

export async function importKey(jwk: {alg: SupportedAlg}): Promise<KeyLike> {
    return importJWK(jwk) as Promise<KeyLike>
}

export async function signCompactJws(alg: SupportedAlg, privateKey: KeyLike, header: any, payload: any): Promise<string> {
    return new SignJWT(payload).setProtectedHeader({...header, alg}).sign(privateKey)
}

// async function test(){
//     const esk = await generateKey('ES384');
//     console.log("ES384 privateKey:", esk.privateKey);
//     const eskSigned = await new SignJWT({ iss: "issuer" }).setProtectedHeader({ alg: 'ES384', jwku: "test" }).sign(esk.privateKey);
//     console.log("Signed ES384", eskSigned);
//     console.log(JSON.stringify(await exportJWK(esk.publicKey)))

//     const rsk = await generateKey('RS384');
//     console.log("RS384 privateKey:", rsk.privateKey);
//     const rskSigned = await new SignJWT({ iss: "issuer" }).setProtectedHeader({ alg: 'RS384', jwku: "test" }).sign(rsk.privateKey);
//     console.log("Signed RS384", rskSigned);
//     console.log(JSON.stringify(await exportJWK(rsk.publicKey)))
// }

// test()