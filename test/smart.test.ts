import { expect } from "@hapi/code";
import * as Lab from "@hapi/lab";
import * as smart from "../src/smart";
import { fhirclient } from "../src/types";
import ServerEnv from "./mocks/ServerEnvironment";
import mockServer        from "./mocks/mockServer";
export const lab = Lab.script();
const { it, describe, before, after, afterEach } = lab;

import * as jose from 'jose';
import HttpRequest from "./mocks/HttpRequest";
import HttpResponse from "./mocks/HttpResponse";
import MemoryStorage from "./mocks/MemoryStorage";
const FHIR = require("../src/entry/node");
const { subtle } = require('node:crypto').webcrypto;

const defaultState = (): fhirclient.ClientState => ({
    serverUrl: 'https://server.example.org',
    redirectUri: 'https://client.example.org/after-auth',
    tokenUri: 'https://server.example.org/token',
    clientId: 'example-client-id',
});

const defaultStateAsymmetricAuth = (): fhirclient.ClientState => ({
    ...defaultState(),
    clientPublicKeySetUrl: "https://client.example.org/.well-known/jwks.json",
    clientPrivateJwk: {
        "kty": "EC",
        "crv": "P-384",
        "d": "WcrTiYk8jbI-Sd1sKNpqGmELWGG08bf_y9SSlnC4cpAl5GRdHHN9gKYlPvMFqiJ5",
        "x": "wcE8O55ro6aOuTf5Ty1k_IG4mTcuLiVercHouge1G5Ri-leevhev4uJzlHpi3U8r",
        "y": "mLRgz8Giu6XA_AqG8bywqbygShmd8jowflrdx0KQtM5X4s4aqDeCRfcpexykp3aI",
        "kid": "afb27c284f2d93959c18fa0320e32060",
        "alg": "ES384",
    }
});

const defaultEnv = () => new ServerEnv({ session: {} });

let mockDataServer, mockUrl;


before(() => {
    return new Promise((resolve, reject) => {
        mockDataServer = mockServer.listen(null, "0.0.0.0", () => {
            const addr = mockDataServer.address();
            mockUrl = `http://127.0.0.1:${addr.port}`;
            // console.log(`Mock Data Server listening at ${mockUrl}`);
            resolve(mockUrl);
        });
    });
});

after(() => {
    if (mockDataServer && mockDataServer.listening) {
        return new Promise(resolve => {
            mockUrl = "";
            mockDataServer.close(error => {
                if (error) {
                    console.log("Error shutting down the mock-data server: ", error);
                }
                resolve(true);
            });
        });
    }
});

afterEach(() => {
    mockServer.clear();
});

describe("smart", () => {

    describe("buildTokenRequest", () => {
        it("uses state.clientSecret", async () => {
            const requestOptions = await smart.buildTokenRequest(defaultEnv(), "example-code", {
                ...defaultState(),
                clientSecret: "test-secret"
            });

            const authz = requestOptions.headers?.['authorization'] as string;
            expect(authz).to.exist();
            expect(authz).to.startWith("Basic ")
        });

        it("generates an assertion with state.clientPrivateJwk", async () => {
            const requestOptions = await smart.buildTokenRequest(
                defaultEnv(),
                "example-code",
                defaultStateAsymmetricAuth());

            expect(requestOptions.body).to.exist();
            expect(requestOptions.body).to.contain('&client_assertion=');
            expect(requestOptions.body).to.contain('&client_assertion_type=urn%3Aietf%3Aparams%3Aoauth%3Aclient-assertion-type%3Ajwt-bearer');

            const assertionMatch = (requestOptions.body as string).match(/client_assertion=(?<assertion>[^&]+)/);
            expect(assertionMatch).not.to.be.null;

            const assertion = assertionMatch?.groups?.assertion;
            expect(assertion).not.to.be.null;

            const clientKey = await jose.importJWK(defaultStateAsymmetricAuth().clientPrivateJwk);
            let validated = await jose.compactVerify(assertion, clientKey)
            expect(validated).to.exist;
            expect(validated.protectedHeader["jku"]).to.equal(defaultStateAsymmetricAuth().clientPublicKeySetUrl);
            expect(validated.protectedHeader["kid"]).to.equal(defaultStateAsymmetricAuth().clientPrivateJwk.kid);
            expect(validated.protectedHeader["typ"]).to.equal("JWT");

            let payload: any = JSON.parse(new TextDecoder().decode(validated.payload));

            expect(payload["aud"]).to.equal(defaultStateAsymmetricAuth().tokenUri);
            expect(payload["iss"]).to.equal(defaultStateAsymmetricAuth().clientId);
            expect(payload["sub"]).to.equal(defaultStateAsymmetricAuth().clientId);
            expect(payload["exp"]).to.exist();
            expect(payload["jti"]).to.exist();
 
        });

        it("authorize accepts clientPrivateJwk as CryptoKey instance", async () => {

            const key   = "my-random-state";
            const req   = new HttpRequest("http://localhost/launch?launch=123&state=" + key);
            const res   = new HttpResponse();
            const store = new MemoryStorage()
            const smart = FHIR(req as any, res as any, store);

            const { privateKey } = await subtle.generateKey({
                name: "ECDSA",
                namedCurve: "P-384"
            }, true, ["sign", "verify"])

            mockServer.mock({
                headers: { "content-type": "application/json" },
                status: 200,
                body: {
                    registration_endpoint : "https://whatever.dev/register",
                    authorization_endpoint: "https://whatever.dev/authorize",
                    token_endpoint        : "https://whatever.dev/token",
                    code_challenge_methods_supported: ["S256"],
                    token_endpoint_auth_methods_supported: ["private_key_jwt"],
                    token_endpoint_auth_signing_alg_values_supported: ["RS384", "ES384"],
                    scopes_supported: ["system/*.rs"]
                }
            });

            const redirect = await smart.authorize({
                client_id: "whatever",
                scope    : "patient/*.read",
                iss: mockUrl,
                clientPublicKeySetUrl: "https://whatever.dev",
                clientPrivateJwk: privateKey as CryptoKey,
                noRedirect: true
            })

            const stateKey = new URL(redirect).searchParams.get("state")
            const state = await store.get(stateKey)
            const privateJWK = state.clientPrivateJwk
            
            expect(privateJWK).to.exist();
            expect(privateJWK.kty).to.equal("EC");
            expect(privateJWK.x).to.exist();
            expect(privateJWK.y).to.exist();
            expect(privateJWK.d).to.exist();
            expect(privateJWK.crv).to.equal("P-384");
            expect(privateJWK.alg).to.equal("ES384");
        });

        it("fails with broken state.clientPrivateJwk", async () => {
            expect(smart.buildTokenRequest(
                defaultEnv(),
                "example-code",
                {
                    ...defaultStateAsymmetricAuth(),
                    clientPrivateJwk: { bad: true } as any
                })
            ).to.reject();
        });

    });

});
