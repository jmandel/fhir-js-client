import { expect } from "@hapi/code";
import * as Lab from "@hapi/lab";
import * as smart from "../src/smart";
import { fhirclient } from "../src/types";
import ServerEnv from "./mocks/ServerEnvironment";
export const lab = Lab.script();
const { it, describe } = lab;

import * as jose from 'jose';

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

        it("fails with broken state.clientPrivateJwk", async () => {
            expect(smart.buildTokenRequest(
                defaultEnv(),
                "example-code",
                {
                    ...defaultStateAsymmetricAuth(),
                    clientPrivateJwk: { bad: true } as any
                })).to.reject();
        });

    });

});
