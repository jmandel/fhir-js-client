import base64url from 'base64url'
import { webcrypto } from 'crypto'

const wcrypto: SubtleCrypto = typeof window !== 'undefined' ?
     window.crypto.subtle
     : (webcrypto as any).subtle as SubtleCrypto;

type JWSAlg = 'ES384' | 'RS384'

const algs: Record<JWSAlg, RsaHashedKeyGenParams | EcKeyGenParams> = {
     "ES384":{name: "ECDSA", namedCurve: "P-384"} ,
     "RS384": {name: "RSASSA-PKCS1-v1_5", modulusLength: 4096, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-384'}
 }

const generateKey = async (jwsAlg: JWSAlg): Promise<CryptoKeyPair> =>
    wcrypto.generateKey(algs[jwsAlg], true, ["sign"]) as unknown as CryptoKeyPair

const signCompactJws = async (privateKey: CryptoKey, header: any, payload: any): Promise<string> => {
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

test()