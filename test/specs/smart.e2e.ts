import { fhirclient } from "../../src/types";


const LAUNCH_URL     = "http://localhost:3000/test/specs/launch.html"
const REDIRECT_URL   = "http://localhost:3000/test/specs/"
const FHIR_URL       = "http://localhost:3000/fhir/"
const AUTHORIZE_URL  = "http://localhost:3000/auth/authorize"
const TOKEN_URL      = "http://localhost:3000/auth/token"
// const INTROSPECT_URL = "http://localhost:3000/auth/introspect"


async function testAuthorize(authorizeParams: fhirclient.AuthorizeParams) {
    
    // Open the browser (Ignores url params!!!)
    await browser.url(LAUNCH_URL);
    
    // Call replaceState to inject URL params
    await browser.execute(`history.replaceState(null, "", "${LAUNCH_URL}?launch=123&iss=${encodeURIComponent(FHIR_URL)}")`)
    
    // Mock the metadata request
    // const mockMetadata = await browser.mock(FHIR_URL + 'metadata');
    // mockMetadata.respond({
    //     resourceType: "CapabilityStatement",
    //     rest: [
    //         {
    //             mode: "server",
    //             security: {
    //                 extension: [
    //                     {
    //                         url: "http://fhir-registry.smarthealthit.org/StructureDefinition/oauth-uris",
    //                         extension: [
    //                             {
    //                                 url: "authorize",
    //                                 valueUri: AUTHORIZE_URL
    //                             },
    //                             {
    //                                 url: "token",
    //                                 valueUri: TOKEN_URL
    //                             },
    //                             {
    //                                 url: "introspect",
    //                                 valueUri: INTROSPECT_URL
    //                             }
    //                         ]
    //                     }
    //                 ]
    //             },
    //             resource: []
    //         }
    //     ]
    // }, {
    //     statusCode: 200,
    //     fetchResponse: false,
    //     headers: {
    //         "content-type": "application/json"
    //     }
    // })

    const mockWellKnownSmartConfig = await browser.mock(FHIR_URL + '.well-known/smart-configuration');
    
    mockWellKnownSmartConfig.respond({
        registration_endpoint : "",
        authorization_endpoint: AUTHORIZE_URL,
        token_endpoint        : TOKEN_URL,
        code_challenge_methods_supported: ["S256"]
    }, {
        statusCode: 200,
        fetchResponse: false,
        headers: {
            "content-type": "application/json"
        }
    });

    const crypto = await browser.execute(`return typeof crypto.subtle`);
    console.log("=====>", crypto)

    // Inject our authorize call into the page
    await browser.execute(`return FHIR.oauth2.authorize(${JSON.stringify(authorizeParams)});`);

    // expect(mockMetadata).toBeRequestedWith({ url: FHIR_URL + "metadata" })

    const url = new URL(await browser.getUrl())

    expect(url.searchParams.get("response_type")).toBe("code")

    if (authorizeParams.clientId) {
        expect(url.searchParams.get("client_id")).toBe(authorizeParams.clientId)
    }
    
    if (authorizeParams.client_id) {
        expect(url.searchParams.get("client_id")).toBe(authorizeParams.client_id)
    }
    
    if (authorizeParams.scope) {
        expect(url.searchParams.get("scope")).toContain(authorizeParams.scope)
    }
    
    expect(url.searchParams.get("scope")).toContain("launch")
    expect(url.searchParams.get("redirect_uri")).toBe(REDIRECT_URL)
    expect(url.searchParams.get("aud")).toBe(FHIR_URL)
    expect(url.searchParams.get("state")).toExist()
    expect(url.searchParams.get("launch")).toBe("123")

    if (authorizeParams.pkceMode !== "disabled") {
        expect(url.searchParams.get("code_challenge")).toExist();
        expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    }
}

beforeEach(() => browser.mockClearAll())

describe("Complete authorization", () => {
    describe("code flow", () => {
        
        it("using clientId", async () => {
            await testAuthorize({
                clientId: "my_web_app",
                scope   : "patient/*.read"
            })
        });

        it("using client_id", async () => {
            await testAuthorize({
                client_id: "my_web_app",
                scope   : "patient/*.read"
            })
        });

        it("using v2 scope", async () => {
            await testAuthorize({
                client_id: "my_web_app",
                scope   : "patient/*.rs"
            })
        });
        
        it("using pkceMode = 'disabled'", async () => {
            await testAuthorize({
                client_id: "my_web_app",
                scope   : "patient/*.rs",
                pkceMode: "disabled"
            })
        });

        it("using pkceMode = 'ifSupported'", async () => {
            await testAuthorize({
                client_id: "my_web_app",
                scope   : "patient/*.rs",
                pkceMode: "ifSupported"
            })
        });

        it("using pkceMode = 'required'", async () => {
            await testAuthorize({
                client_id: "my_web_app",
                scope   : "patient/*.rs",
                pkceMode: "required"
            })
        });

        it("using pkceMode = 'unsafeV1'", async () => {
            await testAuthorize({
                client_id: "my_web_app",
                scope   : "patient/*.rs",
                pkceMode: "unsafeV1"
            })
        });

        it.skip("using custom iss")
        it.skip("using issMatch")
        it.skip("using fhirServiceUrl")
        it.skip("using redirectUri")
        it.skip("using redirect_uri")
        it.skip("using noRedirect")
        it.skip("using patientId")
        it.skip("using encounterId")
        it.skip("using clientSecret")
        it.skip("using clientPublicKeySetUrl")
        it.skip("using clientPrivateJwk")
        it.skip("using clientSecret")
        it.skip("using clientSecret")
    });
});
