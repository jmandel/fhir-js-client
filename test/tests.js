const { URL }    = require("url");
const { expect } = require("@hapi/code");
const lab        = require("@hapi/lab").script();
const lib        = require("../src/lib");
const FhirClient = require("../src/client/client");
const { JSDOM }  = require("jsdom");
const mockServer = require("./mockServer");
// var jwt          = require("jsonwebtoken");
// const Path       = require("path");
// const oauthStuff = require("../src/client/bb-client");
const OPEN_FHIR_SERVER = "https://r3.smarthealthit.org";

const { it, describe, before, after, beforeEach, afterEach } = lab;
exports.lab = lab;

let mockDataServer, mockUrl;


before(() => {
    return new Promise((resolve, reject) => {

        const dom = new JSDOM("", { url: "http://localhost" });
        global.window = dom.window;
        global.sessionStorage = window.sessionStorage;
        global.location = window.location;
        window.jQuery = require("jquery");
        require("../src/adapters/bundle");

        mockDataServer = mockServer.listen(null, "0.0.0.0", error => {
            if (error) {
                return reject(error);
            }
            let addr = mockDataServer.address();
            mockUrl = `http://127.0.0.1:${addr.port}`;
            console.log(`Mock Data Server listening at ${mockUrl}`);
            resolve();
        });
    });
});

after(() => {
    if (mockDataServer && mockDataServer.listening) {
        return new Promise(resolve => {
            mockUrl = "";

            global.window.close();
            delete global.window;
            delete global.sessionStorage;
            delete global.location;

            mockDataServer.close(error => {
                if (error) {
                    console.log("Error shutting down the mock-data server: ", error);
                }
                // console.log("Mock Data Server CLOSED!");
                resolve();
            });
        });
    }
});

// beforeEach(() => {
//     const dom = new JSDOM("", { url: "http://localhost" });
//     global.window = dom.window;
//     global.sessionStorage = window.sessionStorage;
//     global.location = window.location;
//     // window.jQuery = requireUncached("jquery");
//     // global.jQuery = window.jQuery = require("jquery");
//     // global.fhir   = window.fhir   = require("fhir.js");
//     // requireUncached("../src/adapters/bundle.js");
    
//     // global.window.FHIR = require("../src/adapters/bundle").FHIR;
//     // global.window.FHIR = require("../src/client/entry").FHIR;
//     // require("../src/adapters/jquery");
//     require("../src/adapters/bundle");
    
//     // entry(window);

//     // const client       = require("../src/client/client");
//     // const { BBClient } = require("../src/client/bb-client");
//     // window.FHIR = {
//     //     client,
//     //     oauth2: BBClient
//     // };
//     // console.log(window.FHIR)
    
//     // console.log(bundlePath, require.cache[bundlePath], require.cache["../src/adapters/bundle"]);
// // console.log();
// });
afterEach(() => {
    sessionStorage.clear();
    // global.location = window.location;
//     global.window.close();
//     delete global.window;
//     delete global.sessionStorage;
//     delete global.location;
});


describe("Lib", () => {

    describe("urlParam", () => {
        afterEach(() => global.location = window.location);

        it ("works with the global location", () => {
            global.location = { search: "?_dummyName=_dummyValue" };
            expect(lib.urlParam("_dummyName")).to.equal("_dummyValue");
        });
        it ("returns null for missing params", () => {
            global.location = { search: "" };
            expect(lib.urlParam("x")).to.equal(null);
        });
        it ("returns the first occurrence for single param", () => {
            global.location = { search: "?x=y" };
            expect(lib.urlParam("x")).to.equal("y");
        });
        it ("returns the first occurrence for multiple params", () => {
            global.location = { search: "?x=1&x=2&y=3" };
            expect(lib.urlParam("x")).to.equal("1");
        });
        it ("returns and array for multi-params when forceArray = true", () => {
            global.location = { search: "?x=1&x=2&y=3" };
            expect(lib.urlParam("x", true)).to.equal(["1", "2"]);
        });
    });

    describe("stripTrailingSlash", () => {
        it ("returns the same string if it does not end with slash", () => {
            expect(lib.stripTrailingSlash("abc")).to.equal("abc");
        });

        it ("removes the trailing slash", () => {
            expect(lib.stripTrailingSlash("abc/")).to.equal("abc");
        });

        it ("removes repeated trailing slashes", () => {
            expect(lib.stripTrailingSlash("abc///")).to.equal("abc");
        });

        it ("works with non-string argument", () => {
            expect(lib.stripTrailingSlash(null)).to.equal("");
            expect(lib.stripTrailingSlash(false)).to.equal("");
            expect(lib.stripTrailingSlash(undefined)).to.equal("");
            expect(lib.stripTrailingSlash()).to.equal("");
            expect(lib.stripTrailingSlash(53)).to.equal("53");
            expect(lib.stripTrailingSlash(/abc/)).to.equal("/abc");
        });
    });

    describe("relative", () => {

        beforeEach(() => global.location = {
            protocol: "http:",
            host: "localhost",
            pathname: "/a/b"
        });
        afterEach(() => global.location = window.location);

        it ("works as expected", () => {
            expect(lib.relative("c")).to.equal("http://localhost/a/c");
            expect(lib.relative("c/d")).to.equal("http://localhost/a/c/d");
            expect(lib.relative("../c")).to.equal("http://localhost/a/../c");
        });

        it ("'/' resolves to the root", () => {
            expect(lib.relative("/")).to.equal("http://localhost/");
        });

        it ("'' resolves to the current dir", () => {
            expect(lib.relative("")).to.equal("http://localhost/a/");
        });

        it ("'.' resolves to the current dir", () => {
            expect(lib.relative(".")).to.equal("http://localhost/a/");
        });
    });

    describe("readyArgs", () => {
        it ("throws with no arguments", () => {
            expect(() => lib.readyArgs()).to.throw();
        });

        it ("throws with more than 3 arguments", () => {
            expect(() => lib.readyArgs(1,2,3,4)).to.throw();
        });

        it ("throws with 2 arguments if the first one isn't a function or object", () => {
            expect(() => lib.readyArgs(1,() => {})).to.throw();
        });
    });
});

describe("FHIR.oauth2", () => {

    // before(() => {
    //     const dom = new JSDOM("", { url: "http://localhost" });
    //     global.window = dom.window;
    //     window.jQuery = require("jquery");
    //     require("../src/adapters/bundle");
    // });

    // after(() => {
    //     global.window.close();
    //     delete global.window;
    // });

    // oauthStuff

    describe("authorize", () => {
        
        it ("throws if called without params", () => {
            expect(() => window.FHIR.oauth2.preAuthorize()).to.throw();
        });

        it ("redirects to the proper URL", () => {
            // console.log(window.FHIR)
            global.location = {
                search: "?iss=" + encodeURIComponent(mockUrl) + "&launch=123",
                protocol: "https:",
                host: "localhost",
                pathname: "/a/b"
            };
            // console.log(global.window.FHIR)
            return new Promise((resolve, reject) => {
                
                mockServer.mock({
                    headers: {
                        "content-type": "application/json"
                    },
                    status: 200,
                    body: {
                        rest: [
                            {
                                security: {
                                    extension: [
                                        {
                                            url: "http://fhir-registry.smarthealthit.org/StructureDefinition/oauth-uris",
                                            extension: [
                                                {
                                                    url: "authorize",
                                                    valueUri: "https://my-authorize-uri"
                                                },
                                                {
                                                    url: "token",
                                                    valueUri: "https://my-token-uri"
                                                }
                                            ]
                                        }
                                    ]
                                }
                            }
                        ]
                    }
                });
                // console.log(global.window.FHIR)
                window.FHIR.oauth2.preAuthorize({
                    // iss: "https://r3.smarthealthit.org",
                    scope: "Patient/*.read",
                    client_id: "test-client-id"
                }, redirect => {
                    // global.location = window.location;
                    // console.log("redirect:", redirect);
                    const url = new URL(redirect);
                    expect(url.origin).to.equal("https://my-authorize-uri");
                    expect(url.searchParams.get("redirect_uri")).to.equal("https://localhost/a/");
                    expect(url.searchParams.get("response_type")).to.equal("code");
                    expect(url.searchParams.get("scope")).to.equal("Patient/*.read launch");
                    expect(url.searchParams.get("launch")).to.equal("123");
                    expect(url.searchParams.get("aud")).to.equal(mockUrl);
                    expect(url.searchParams.get("client_id")).to.equal("test-client-id");
                    expect(url.searchParams.get("state")).to.exist();
                    resolve();
                }, error => {
                    // global.location = window.location;
                    reject(error);
                });
            });
        });

    });

    describe ("ready", () => {

        function expectClient(client) {
            expect(client).to.include([
                "server",
                "api",
                "patient",
                "userId",
                "authenticated",
                "get",
                "user",
                "getBinary",
                "fetchBinary",
                "state",
                "tokenResponse"
            ]);
            expect(client.server).to.equal({
                serviceUrl: "https://r3.smarthealthit.org",
                auth: {
                    type: "bearer",
                    token: "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJuZWVkX3BhdGllbnRfYmFubmVyIjp0cnVlLCJzbWFydF9zdHlsZV91cmwiOiJodHRwczovL2xhdW5jaC5zbWFydGhlYWx0aGl0Lm9yZy9zbWFydC1zdHlsZS5qc29uIiwicGF0aWVudCI6ImViMzI3MWUxLWFlMWItNDY0NC05MzMyLTQxZTMyYzgyOTQ4NiIsImVuY291bnRlciI6IjMxYjE4YWEwLTBkYTctNDQ2MC05NjMzLTA0YWY0MTQ2NmQ3NiIsInJlZnJlc2hfdG9rZW4iOiJleUowZVhBaU9pSktWMVFpTENKaGJHY2lPaUpJVXpJMU5pSjkuZXlKamIyNTBaWGgwSWpwN0ltNWxaV1JmY0dGMGFXVnVkRjlpWVc1dVpYSWlPblJ5ZFdVc0luTnRZWEowWDNOMGVXeGxYM1Z5YkNJNkltaDBkSEJ6T2k4dmJHRjFibU5vTG5OdFlYSjBhR1ZoYkhSb2FYUXViM0puTDNOdFlYSjBMWE4wZVd4bExtcHpiMjRpTENKd1lYUnBaVzUwSWpvaVpXSXpNamN4WlRFdFlXVXhZaTAwTmpRMExUa3pNekl0TkRGbE16SmpPREk1TkRnMklpd2laVzVqYjNWdWRHVnlJam9pTXpGaU1UaGhZVEF0TUdSaE55MDBORFl3TFRrMk16TXRNRFJoWmpReE5EWTJaRGMySW4wc0ltTnNhV1Z1ZEY5cFpDSTZJbTE1WDNkbFlsOWhjSEFpTENKelkyOXdaU0k2SW05d1pXNXBaQ0JtYUdseVZYTmxjaUJ2Wm1ac2FXNWxYMkZqWTJWemN5QjFjMlZ5THlvdUtpQndZWFJwWlc1MEx5b3VLaUJzWVhWdVkyZ3ZaVzVqYjNWdWRHVnlJR3hoZFc1amFDOXdZWFJwWlc1MElIQnliMlpwYkdVaUxDSjFjMlZ5SWpvaVVISmhZM1JwZEdsdmJtVnlMM050WVhKMExWQnlZV04wYVhScGIyNWxjaTAzTVRRNE1qY3hNeUlzSW1saGRDSTZNVFUxT0RjeE1EazJOQ3dpWlhod0lqb3hOVGt3TWpRMk9UWTFmUS5mNXlOWS15S0tEZTBhNTlfZUZncDZzMHJIU2dQTFhnbUFXRFB6X2hFVWdzIiwidG9rZW5fdHlwZSI6ImJlYXJlciIsInNjb3BlIjoib3BlbmlkIGZoaXJVc2VyIG9mZmxpbmVfYWNjZXNzIHVzZXIvKi4qIHBhdGllbnQvKi4qIGxhdW5jaC9lbmNvdW50ZXIgbGF1bmNoL3BhdGllbnQgcHJvZmlsZSIsImNsaWVudF9pZCI6Im15X3dlYl9hcHAiLCJleHBpcmVzX2luIjozNjAwLCJpZF90b2tlbiI6ImV5SjBlWEFpT2lKS1YxUWlMQ0poYkdjaU9pSlNVekkxTmlKOS5leUp3Y205bWFXeGxJam9pVUhKaFkzUnBkR2x2Ym1WeUwzTnRZWEowTFZCeVlXTjBhWFJwYjI1bGNpMDNNVFE0TWpjeE15SXNJbVpvYVhKVmMyVnlJam9pVUhKaFkzUnBkR2x2Ym1WeUwzTnRZWEowTFZCeVlXTjBhWFJwYjI1bGNpMDNNVFE0TWpjeE15SXNJbUYxWkNJNkltMTVYM2RsWWw5aGNIQWlMQ0p6ZFdJaU9pSmtZakl6WkRCa1pUSTFOamM0WlRZM01EazVZbU0wTXpRek1qTmtZekJrT1RZMU1UTmlOVFV5TW1RMFlqYzBNV05pWVRNNVpqZGpPVEprTUdNME5tRmxJaXdpYVhOeklqb2lhSFIwY0RvdkwyeGhkVzVqYUM1emJXRnlkR2hsWVd4MGFHbDBMbTl5WnlJc0ltbGhkQ0k2TVRVMU9EY3hNRGsyTlN3aVpYaHdJam94TlRVNE56RTBOVFkxZlEuVzFPSmdWUl9wOTdERlRaSmZhLWI2aWRmNktZMTUtbE81WU9nNHROZkJ5X3dmUHVpbHBUeXZBcDFHRnc2TFpGMnFhNkFWYV9oc1BoXy1GSTJKNkN6MGlqZkFZbVMzdFZwYVZYSGhpMjZsUG5QdUIxVjFUbWJ6YVhDWmJYaC1pdjl4WTNZQXFFRTgyMjFjTXRzQ3FXUFM3aUlMYmJJZmozQnlNMm04aXNRVS1pOGhxLUdTV2ZKNTlwczRGMFZNdlI0QmlPUUdIOXQ5TFQ0TDVxNnNsLU9ONUpJVnJFdnEweFJQVjBrTnpqbUVheklLbV9MMllZM09yMVYwbE02Q0otM2U4RkdkUElIRlRpMjJXcVc1dXhBU2NDVm1hZ1h4S2l5T2xNRWc3dGtjUHA3MjJtS3B0MTMwT3lzaUZyOGpZaElYZkdhX3VGN0tDVFhTZ0RrZEV1WlNRIiwiaWF0IjoxNTU4NzEwOTY1LCJleHAiOjE1NTg3MTQ1NjV9.FDRzViWLg4rMfDzr7Bx01pt5t7CapzcJwQcaFTVcu3E"
                }
            });
            expect(client.api).to.include([
                "conformance",
                "read",
                "delete",
                "create",
                "search",
                "update",
                "nextPage",
                "prevPage",
                "fetchAll",
                "fetchAllWithReferences"
            ]);
            expect(client.patient).to.include([
                "id",
                "api",
                "read"
            ]);
            expect(client.patient.id).to.equal("eb3271e1-ae1b-4644-9332-41e32c829486");
            expect(client.userId).to.equal("Practitioner/smart-Practitioner-71482713");
            expect(client.user).to.include("read");
        }

        it ("rejects unauthorized state", () => {
            return new Promise((resolve, reject) => {
                window.FHIR.oauth2.ready(() => {
                    reject(new Error("This should have failed"));
                }, error => {
                    expect(error).to.equal("No 'state' parameter found in authorization response.");
                    resolve();
                });
            });
        });

        it ("works on page reload", () => {
            window.FHIR.oauth2.settings.fullSessionStorageSupport = true;
            sessionStorage.tokenResponse = JSON.stringify({
                "need_patient_banner": true,
                "smart_style_url": "https://launch.smarthealthit.org/smart-style.json",
                "patient": "eb3271e1-ae1b-4644-9332-41e32c829486",
                "encounter": "31b18aa0-0da7-4460-9633-04af41466d76",
                "refresh_token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJjb250ZXh0Ijp7Im5lZWRfcGF0aWVudF9iYW5uZXIiOnRydWUsInNtYXJ0X3N0eWxlX3VybCI6Imh0dHBzOi8vbGF1bmNoLnNtYXJ0aGVhbHRoaXQub3JnL3NtYXJ0LXN0eWxlLmpzb24iLCJwYXRpZW50IjoiZWIzMjcxZTEtYWUxYi00NjQ0LTkzMzItNDFlMzJjODI5NDg2IiwiZW5jb3VudGVyIjoiMzFiMThhYTAtMGRhNy00NDYwLTk2MzMtMDRhZjQxNDY2ZDc2In0sImNsaWVudF9pZCI6Im15X3dlYl9hcHAiLCJzY29wZSI6Im9wZW5pZCBmaGlyVXNlciBvZmZsaW5lX2FjY2VzcyB1c2VyLyouKiBwYXRpZW50LyouKiBsYXVuY2gvZW5jb3VudGVyIGxhdW5jaC9wYXRpZW50IHByb2ZpbGUiLCJ1c2VyIjoiUHJhY3RpdGlvbmVyL3NtYXJ0LVByYWN0aXRpb25lci03MTQ4MjcxMyIsImlhdCI6MTU1ODcxMDk2NCwiZXhwIjoxNTkwMjQ2OTY1fQ.f5yNY-yKKDe0a59_eFgp6s0rHSgPLXgmAWDPz_hEUgs",
                "token_type": "bearer",
                "scope": "openid fhirUser offline_access user/*.* patient/*.* launch/encounter launch/patient profile",
                "client_id": "my_web_app",
                "expires_in": 3600,
                "id_token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJwcm9maWxlIjoiUHJhY3RpdGlvbmVyL3NtYXJ0LVByYWN0aXRpb25lci03MTQ4MjcxMyIsImZoaXJVc2VyIjoiUHJhY3RpdGlvbmVyL3NtYXJ0LVByYWN0aXRpb25lci03MTQ4MjcxMyIsImF1ZCI6Im15X3dlYl9hcHAiLCJzdWIiOiJkYjIzZDBkZTI1Njc4ZTY3MDk5YmM0MzQzMjNkYzBkOTY1MTNiNTUyMmQ0Yjc0MWNiYTM5ZjdjOTJkMGM0NmFlIiwiaXNzIjoiaHR0cDovL2xhdW5jaC5zbWFydGhlYWx0aGl0Lm9yZyIsImlhdCI6MTU1ODcxMDk2NSwiZXhwIjoxNTU4NzE0NTY1fQ.W1OJgVR_p97DFTZJfa-b6idf6KY15-lO5YOg4tNfBy_wfPuilpTyvAp1GFw6LZF2qa6AVa_hsPh_-FI2J6Cz0ijfAYmS3tVpaVXHhi26lPnPuB1V1TmbzaXCZbXh-iv9xY3YAqEE8221cMtsCqWPS7iILbbIfj3ByM2m8isQU-i8hq-GSWfJ59ps4F0VMvR4BiOQGH9t9LT4L5q6sl-ON5JIVrEvq0xRPV0kNzjmEazIKm_L2YY3Or1V0lM6CJ-3e8FGdPIHFTi22WqW5uxAScCVmagXxKiyOlMEg7tkcPp722mKpt130OysiFr8jYhIXfGa_uF7KCTXSgDkdEuZSQ",
                "access_token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJuZWVkX3BhdGllbnRfYmFubmVyIjp0cnVlLCJzbWFydF9zdHlsZV91cmwiOiJodHRwczovL2xhdW5jaC5zbWFydGhlYWx0aGl0Lm9yZy9zbWFydC1zdHlsZS5qc29uIiwicGF0aWVudCI6ImViMzI3MWUxLWFlMWItNDY0NC05MzMyLTQxZTMyYzgyOTQ4NiIsImVuY291bnRlciI6IjMxYjE4YWEwLTBkYTctNDQ2MC05NjMzLTA0YWY0MTQ2NmQ3NiIsInJlZnJlc2hfdG9rZW4iOiJleUowZVhBaU9pSktWMVFpTENKaGJHY2lPaUpJVXpJMU5pSjkuZXlKamIyNTBaWGgwSWpwN0ltNWxaV1JmY0dGMGFXVnVkRjlpWVc1dVpYSWlPblJ5ZFdVc0luTnRZWEowWDNOMGVXeGxYM1Z5YkNJNkltaDBkSEJ6T2k4dmJHRjFibU5vTG5OdFlYSjBhR1ZoYkhSb2FYUXViM0puTDNOdFlYSjBMWE4wZVd4bExtcHpiMjRpTENKd1lYUnBaVzUwSWpvaVpXSXpNamN4WlRFdFlXVXhZaTAwTmpRMExUa3pNekl0TkRGbE16SmpPREk1TkRnMklpd2laVzVqYjNWdWRHVnlJam9pTXpGaU1UaGhZVEF0TUdSaE55MDBORFl3TFRrMk16TXRNRFJoWmpReE5EWTJaRGMySW4wc0ltTnNhV1Z1ZEY5cFpDSTZJbTE1WDNkbFlsOWhjSEFpTENKelkyOXdaU0k2SW05d1pXNXBaQ0JtYUdseVZYTmxjaUJ2Wm1ac2FXNWxYMkZqWTJWemN5QjFjMlZ5THlvdUtpQndZWFJwWlc1MEx5b3VLaUJzWVhWdVkyZ3ZaVzVqYjNWdWRHVnlJR3hoZFc1amFDOXdZWFJwWlc1MElIQnliMlpwYkdVaUxDSjFjMlZ5SWpvaVVISmhZM1JwZEdsdmJtVnlMM050WVhKMExWQnlZV04wYVhScGIyNWxjaTAzTVRRNE1qY3hNeUlzSW1saGRDSTZNVFUxT0RjeE1EazJOQ3dpWlhod0lqb3hOVGt3TWpRMk9UWTFmUS5mNXlOWS15S0tEZTBhNTlfZUZncDZzMHJIU2dQTFhnbUFXRFB6X2hFVWdzIiwidG9rZW5fdHlwZSI6ImJlYXJlciIsInNjb3BlIjoib3BlbmlkIGZoaXJVc2VyIG9mZmxpbmVfYWNjZXNzIHVzZXIvKi4qIHBhdGllbnQvKi4qIGxhdW5jaC9lbmNvdW50ZXIgbGF1bmNoL3BhdGllbnQgcHJvZmlsZSIsImNsaWVudF9pZCI6Im15X3dlYl9hcHAiLCJleHBpcmVzX2luIjozNjAwLCJpZF90b2tlbiI6ImV5SjBlWEFpT2lKS1YxUWlMQ0poYkdjaU9pSlNVekkxTmlKOS5leUp3Y205bWFXeGxJam9pVUhKaFkzUnBkR2x2Ym1WeUwzTnRZWEowTFZCeVlXTjBhWFJwYjI1bGNpMDNNVFE0TWpjeE15SXNJbVpvYVhKVmMyVnlJam9pVUhKaFkzUnBkR2x2Ym1WeUwzTnRZWEowTFZCeVlXTjBhWFJwYjI1bGNpMDNNVFE0TWpjeE15SXNJbUYxWkNJNkltMTVYM2RsWWw5aGNIQWlMQ0p6ZFdJaU9pSmtZakl6WkRCa1pUSTFOamM0WlRZM01EazVZbU0wTXpRek1qTmtZekJrT1RZMU1UTmlOVFV5TW1RMFlqYzBNV05pWVRNNVpqZGpPVEprTUdNME5tRmxJaXdpYVhOeklqb2lhSFIwY0RvdkwyeGhkVzVqYUM1emJXRnlkR2hsWVd4MGFHbDBMbTl5WnlJc0ltbGhkQ0k2TVRVMU9EY3hNRGsyTlN3aVpYaHdJam94TlRVNE56RTBOVFkxZlEuVzFPSmdWUl9wOTdERlRaSmZhLWI2aWRmNktZMTUtbE81WU9nNHROZkJ5X3dmUHVpbHBUeXZBcDFHRnc2TFpGMnFhNkFWYV9oc1BoXy1GSTJKNkN6MGlqZkFZbVMzdFZwYVZYSGhpMjZsUG5QdUIxVjFUbWJ6YVhDWmJYaC1pdjl4WTNZQXFFRTgyMjFjTXRzQ3FXUFM3aUlMYmJJZmozQnlNMm04aXNRVS1pOGhxLUdTV2ZKNTlwczRGMFZNdlI0QmlPUUdIOXQ5TFQ0TDVxNnNsLU9ONUpJVnJFdnEweFJQVjBrTnpqbUVheklLbV9MMllZM09yMVYwbE02Q0otM2U4RkdkUElIRlRpMjJXcVc1dXhBU2NDVm1hZ1h4S2l5T2xNRWc3dGtjUHA3MjJtS3B0MTMwT3lzaUZyOGpZaElYZkdhX3VGN0tDVFhTZ0RrZEV1WlNRIiwiaWF0IjoxNTU4NzEwOTY1LCJleHAiOjE1NTg3MTQ1NjV9.FDRzViWLg4rMfDzr7Bx01pt5t7CapzcJwQcaFTVcu3E",
                "code": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJjb250ZXh0Ijp7Im5lZWRfcGF0aWVudF9iYW5uZXIiOnRydWUsInNtYXJ0X3N0eWxlX3VybCI6Imh0dHBzOi8vbGF1bmNoLnNtYXJ0aGVhbHRoaXQub3JnL3NtYXJ0LXN0eWxlLmpzb24iLCJwYXRpZW50IjoiZWIzMjcxZTEtYWUxYi00NjQ0LTkzMzItNDFlMzJjODI5NDg2IiwiZW5jb3VudGVyIjoiMzFiMThhYTAtMGRhNy00NDYwLTk2MzMtMDRhZjQxNDY2ZDc2In0sImNsaWVudF9pZCI6Im15X3dlYl9hcHAiLCJzY29wZSI6Im9wZW5pZCBmaGlyVXNlciBvZmZsaW5lX2FjY2VzcyB1c2VyLyouKiBwYXRpZW50LyouKiBsYXVuY2gvZW5jb3VudGVyIGxhdW5jaC9wYXRpZW50IHByb2ZpbGUiLCJ1c2VyIjoiUHJhY3RpdGlvbmVyL3NtYXJ0LVByYWN0aXRpb25lci03MTQ4MjcxMyIsImlhdCI6MTU1ODcxMDk2NCwiZXhwIjoxNTU4NzExMjY0fQ.T52HWAK2Vk9X1hPDypvXGru4cK0QVhkVoJ68JQT35bU",
                "state": "my_test_state_key",
                test: 1
            });
            sessionStorage.my_test_state_key = JSON.stringify({
                response_type: "code",
                client: {
                    redirect_uri: "whatever",
                    scope: "whatever launch"
                },
                server: "whatever",
                provider: {
                    url: "https://r3.smarthealthit.org",
                    oauth2: {
                        token_uri: mockUrl
                    }
                }
            });

            return new Promise((resolve, reject) => {
                window.FHIR.oauth2.ready(result => {
                    expectClient(result);             
                    resolve();
                }, error => {
                    reject(new Error(error));
                });
            });
        });

        it ("can bypass oauth using fhirServiceUrl parameter");
        it ("works on page reload with refresh tokens");
        it ("completeTokenFlow");
        it ("works", () => {
            return new Promise((resolve, reject) => {

                // At this point `FHIR.oauth2.authorize` should have been called
                // (typically from a `launch.html` page). That should have created
                // a state object in our sessionStorage. We start by mocking that.
                const state = "my_test_state_key";
                const fullSessionStorageSupport = window.FHIR.oauth2.settings.fullSessionStorageSupport;
                const params = {
                    response_type: "code",
                    client: {
                        redirect_uri: "whatever",
                        scope: "whatever launch"
                    },
                    server: "whatever",
                    provider: {
                        url: "https://r3.smarthealthit.org",
                        oauth2: {
                            token_uri: mockUrl
                        }
                    }
                };

                if (fullSessionStorageSupport) {
                    sessionStorage[state] = JSON.stringify(params);
                    // sessionStorage.tokenResponse = JSON.stringify({ state });
                } else {
                    sessionStorage[state] = JSON.stringify({
                        ...params,
                        tokenResponse : { state }
                    });
                }

                // Now we have landed on a page after the auth server redirected to
                // it, passing `code` and `state` params. Mock those up;
                global.location = {
                    search: "?code=whatever&state=my_test_state_key"
                };

                // If everything goes as planned, FHIR.oauth2.ready should make a
                // POST request to the token endpoint to obtain an access token.
                // Mock that up now:
                mockServer.mock({
                    headers: {
                        "content-type": "application/json"
                    },
                    status: 200,
                    body: {
                        "need_patient_banner": true,
                        "smart_style_url": "https://launch.smarthealthit.org/smart-style.json",
                        "patient": "eb3271e1-ae1b-4644-9332-41e32c829486",
                        "encounter": "31b18aa0-0da7-4460-9633-04af41466d76",
                        "refresh_token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJjb250ZXh0Ijp7Im5lZWRfcGF0aWVudF9iYW5uZXIiOnRydWUsInNtYXJ0X3N0eWxlX3VybCI6Imh0dHBzOi8vbGF1bmNoLnNtYXJ0aGVhbHRoaXQub3JnL3NtYXJ0LXN0eWxlLmpzb24iLCJwYXRpZW50IjoiZWIzMjcxZTEtYWUxYi00NjQ0LTkzMzItNDFlMzJjODI5NDg2IiwiZW5jb3VudGVyIjoiMzFiMThhYTAtMGRhNy00NDYwLTk2MzMtMDRhZjQxNDY2ZDc2In0sImNsaWVudF9pZCI6Im15X3dlYl9hcHAiLCJzY29wZSI6Im9wZW5pZCBmaGlyVXNlciBvZmZsaW5lX2FjY2VzcyB1c2VyLyouKiBwYXRpZW50LyouKiBsYXVuY2gvZW5jb3VudGVyIGxhdW5jaC9wYXRpZW50IHByb2ZpbGUiLCJ1c2VyIjoiUHJhY3RpdGlvbmVyL3NtYXJ0LVByYWN0aXRpb25lci03MTQ4MjcxMyIsImlhdCI6MTU1ODcxMDk2NCwiZXhwIjoxNTkwMjQ2OTY1fQ.f5yNY-yKKDe0a59_eFgp6s0rHSgPLXgmAWDPz_hEUgs",
                        "token_type": "bearer",
                        "scope": "openid fhirUser offline_access user/*.* patient/*.* launch/encounter launch/patient profile",
                        "client_id": "my_web_app",
                        "expires_in": 3600,
                        "id_token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJwcm9maWxlIjoiUHJhY3RpdGlvbmVyL3NtYXJ0LVByYWN0aXRpb25lci03MTQ4MjcxMyIsImZoaXJVc2VyIjoiUHJhY3RpdGlvbmVyL3NtYXJ0LVByYWN0aXRpb25lci03MTQ4MjcxMyIsImF1ZCI6Im15X3dlYl9hcHAiLCJzdWIiOiJkYjIzZDBkZTI1Njc4ZTY3MDk5YmM0MzQzMjNkYzBkOTY1MTNiNTUyMmQ0Yjc0MWNiYTM5ZjdjOTJkMGM0NmFlIiwiaXNzIjoiaHR0cDovL2xhdW5jaC5zbWFydGhlYWx0aGl0Lm9yZyIsImlhdCI6MTU1ODcxMDk2NSwiZXhwIjoxNTU4NzE0NTY1fQ.W1OJgVR_p97DFTZJfa-b6idf6KY15-lO5YOg4tNfBy_wfPuilpTyvAp1GFw6LZF2qa6AVa_hsPh_-FI2J6Cz0ijfAYmS3tVpaVXHhi26lPnPuB1V1TmbzaXCZbXh-iv9xY3YAqEE8221cMtsCqWPS7iILbbIfj3ByM2m8isQU-i8hq-GSWfJ59ps4F0VMvR4BiOQGH9t9LT4L5q6sl-ON5JIVrEvq0xRPV0kNzjmEazIKm_L2YY3Or1V0lM6CJ-3e8FGdPIHFTi22WqW5uxAScCVmagXxKiyOlMEg7tkcPp722mKpt130OysiFr8jYhIXfGa_uF7KCTXSgDkdEuZSQ",
                        "access_token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJuZWVkX3BhdGllbnRfYmFubmVyIjp0cnVlLCJzbWFydF9zdHlsZV91cmwiOiJodHRwczovL2xhdW5jaC5zbWFydGhlYWx0aGl0Lm9yZy9zbWFydC1zdHlsZS5qc29uIiwicGF0aWVudCI6ImViMzI3MWUxLWFlMWItNDY0NC05MzMyLTQxZTMyYzgyOTQ4NiIsImVuY291bnRlciI6IjMxYjE4YWEwLTBkYTctNDQ2MC05NjMzLTA0YWY0MTQ2NmQ3NiIsInJlZnJlc2hfdG9rZW4iOiJleUowZVhBaU9pSktWMVFpTENKaGJHY2lPaUpJVXpJMU5pSjkuZXlKamIyNTBaWGgwSWpwN0ltNWxaV1JmY0dGMGFXVnVkRjlpWVc1dVpYSWlPblJ5ZFdVc0luTnRZWEowWDNOMGVXeGxYM1Z5YkNJNkltaDBkSEJ6T2k4dmJHRjFibU5vTG5OdFlYSjBhR1ZoYkhSb2FYUXViM0puTDNOdFlYSjBMWE4wZVd4bExtcHpiMjRpTENKd1lYUnBaVzUwSWpvaVpXSXpNamN4WlRFdFlXVXhZaTAwTmpRMExUa3pNekl0TkRGbE16SmpPREk1TkRnMklpd2laVzVqYjNWdWRHVnlJam9pTXpGaU1UaGhZVEF0TUdSaE55MDBORFl3TFRrMk16TXRNRFJoWmpReE5EWTJaRGMySW4wc0ltTnNhV1Z1ZEY5cFpDSTZJbTE1WDNkbFlsOWhjSEFpTENKelkyOXdaU0k2SW05d1pXNXBaQ0JtYUdseVZYTmxjaUJ2Wm1ac2FXNWxYMkZqWTJWemN5QjFjMlZ5THlvdUtpQndZWFJwWlc1MEx5b3VLaUJzWVhWdVkyZ3ZaVzVqYjNWdWRHVnlJR3hoZFc1amFDOXdZWFJwWlc1MElIQnliMlpwYkdVaUxDSjFjMlZ5SWpvaVVISmhZM1JwZEdsdmJtVnlMM050WVhKMExWQnlZV04wYVhScGIyNWxjaTAzTVRRNE1qY3hNeUlzSW1saGRDSTZNVFUxT0RjeE1EazJOQ3dpWlhod0lqb3hOVGt3TWpRMk9UWTFmUS5mNXlOWS15S0tEZTBhNTlfZUZncDZzMHJIU2dQTFhnbUFXRFB6X2hFVWdzIiwidG9rZW5fdHlwZSI6ImJlYXJlciIsInNjb3BlIjoib3BlbmlkIGZoaXJVc2VyIG9mZmxpbmVfYWNjZXNzIHVzZXIvKi4qIHBhdGllbnQvKi4qIGxhdW5jaC9lbmNvdW50ZXIgbGF1bmNoL3BhdGllbnQgcHJvZmlsZSIsImNsaWVudF9pZCI6Im15X3dlYl9hcHAiLCJleHBpcmVzX2luIjozNjAwLCJpZF90b2tlbiI6ImV5SjBlWEFpT2lKS1YxUWlMQ0poYkdjaU9pSlNVekkxTmlKOS5leUp3Y205bWFXeGxJam9pVUhKaFkzUnBkR2x2Ym1WeUwzTnRZWEowTFZCeVlXTjBhWFJwYjI1bGNpMDNNVFE0TWpjeE15SXNJbVpvYVhKVmMyVnlJam9pVUhKaFkzUnBkR2x2Ym1WeUwzTnRZWEowTFZCeVlXTjBhWFJwYjI1bGNpMDNNVFE0TWpjeE15SXNJbUYxWkNJNkltMTVYM2RsWWw5aGNIQWlMQ0p6ZFdJaU9pSmtZakl6WkRCa1pUSTFOamM0WlRZM01EazVZbU0wTXpRek1qTmtZekJrT1RZMU1UTmlOVFV5TW1RMFlqYzBNV05pWVRNNVpqZGpPVEprTUdNME5tRmxJaXdpYVhOeklqb2lhSFIwY0RvdkwyeGhkVzVqYUM1emJXRnlkR2hsWVd4MGFHbDBMbTl5WnlJc0ltbGhkQ0k2TVRVMU9EY3hNRGsyTlN3aVpYaHdJam94TlRVNE56RTBOVFkxZlEuVzFPSmdWUl9wOTdERlRaSmZhLWI2aWRmNktZMTUtbE81WU9nNHROZkJ5X3dmUHVpbHBUeXZBcDFHRnc2TFpGMnFhNkFWYV9oc1BoXy1GSTJKNkN6MGlqZkFZbVMzdFZwYVZYSGhpMjZsUG5QdUIxVjFUbWJ6YVhDWmJYaC1pdjl4WTNZQXFFRTgyMjFjTXRzQ3FXUFM3aUlMYmJJZmozQnlNMm04aXNRVS1pOGhxLUdTV2ZKNTlwczRGMFZNdlI0QmlPUUdIOXQ5TFQ0TDVxNnNsLU9ONUpJVnJFdnEweFJQVjBrTnpqbUVheklLbV9MMllZM09yMVYwbE02Q0otM2U4RkdkUElIRlRpMjJXcVc1dXhBU2NDVm1hZ1h4S2l5T2xNRWc3dGtjUHA3MjJtS3B0MTMwT3lzaUZyOGpZaElYZkdhX3VGN0tDVFhTZ0RrZEV1WlNRIiwiaWF0IjoxNTU4NzEwOTY1LCJleHAiOjE1NTg3MTQ1NjV9.FDRzViWLg4rMfDzr7Bx01pt5t7CapzcJwQcaFTVcu3E",
                        "code": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJjb250ZXh0Ijp7Im5lZWRfcGF0aWVudF9iYW5uZXIiOnRydWUsInNtYXJ0X3N0eWxlX3VybCI6Imh0dHBzOi8vbGF1bmNoLnNtYXJ0aGVhbHRoaXQub3JnL3NtYXJ0LXN0eWxlLmpzb24iLCJwYXRpZW50IjoiZWIzMjcxZTEtYWUxYi00NjQ0LTkzMzItNDFlMzJjODI5NDg2IiwiZW5jb3VudGVyIjoiMzFiMThhYTAtMGRhNy00NDYwLTk2MzMtMDRhZjQxNDY2ZDc2In0sImNsaWVudF9pZCI6Im15X3dlYl9hcHAiLCJzY29wZSI6Im9wZW5pZCBmaGlyVXNlciBvZmZsaW5lX2FjY2VzcyB1c2VyLyouKiBwYXRpZW50LyouKiBsYXVuY2gvZW5jb3VudGVyIGxhdW5jaC9wYXRpZW50IHByb2ZpbGUiLCJ1c2VyIjoiUHJhY3RpdGlvbmVyL3NtYXJ0LVByYWN0aXRpb25lci03MTQ4MjcxMyIsImlhdCI6MTU1ODcxMDk2NCwiZXhwIjoxNTU4NzExMjY0fQ.T52HWAK2Vk9X1hPDypvXGru4cK0QVhkVoJ68JQT35bU",
                        "state": "my_test_state_key"
                    }
                });

                window.FHIR.oauth2.ready(result => {
                    // console.log("result:", result);
                    expectClient(result);
                    resolve();
                }, error => {
                    console.log("error:", error);
                    reject(new Error(error));
                });
            });
        });
    });

    describe("resolveAuthType", () => {
        
        it ("returns 'none' if the conformance does not declare a smart-on-fhir service", () => {
            return new Promise((resolve, reject) => {
                mockServer.mock({
                    headers: {
                        "content-type": "application/json"
                    },
                    status: 200,
                    body: {}
                });
                window.FHIR.oauth2.resolveAuthType(
                    mockUrl,
                    result => {
                        expect(result).to.equal("none");
                        resolve();
                    },
                    error => {
                        reject(new Error(error));
                    }
                );
            });
        });

        it ("returns 'oauth2' if the conformance does declare a smart-on-fhir service", () => {
            return new Promise((resolve, reject) => {
                mockServer.mock({
                    headers: {
                        "content-type": "application/json"
                    },
                    status: 200,
                    body: {
                        rest: [
                            {
                                security: {
                                    service: [
                                        {
                                            coding: [
                                                {
                                                    code: "smart-on-fhir"
                                                }
                                            ]
                                        }
                                    ]
                                }
                            }
                        ]
                    }
                });
                window.FHIR.oauth2.resolveAuthType(
                    mockUrl,
                    result => {
                        expect(result).to.equal("oauth2");
                        resolve();
                    },
                    error => {
                        reject(new Error(error));
                    }
                );
            });
        });
    });
});

describe("FHIR.client", () => {

    describe("constructor", () => {
        it ("throws if initialized without arguments", () => {
            expect(() => new window.FHIR.client()).to.throw();
        });

        it ("throws if initialized without serviceUrl", () => {
            expect(() => new window.FHIR.client({})).to.throw();
        });
    });

    describe("client.request", () => {
        it ("can fetch single resource", async () => {
            const client = window.FHIR.client({ serviceUrl: mockUrl });
            mockServer.mock({
                headers: { "content-type": "application/json" },
                status: 200,
                body: {
                    resourceType: "Patient",
                    id: "2e27c71e-30c8-4ceb-8c1c-5641e066c0a4"
                }
            });
            const result = await client.request("/Patient/2e27c71e-30c8-4ceb-8c1c-5641e066c0a4");
            expect(result).to.include({
                resourceType: "Patient",
                id: "2e27c71e-30c8-4ceb-8c1c-5641e066c0a4"
            });
        });

        it ("ignores pageLimit if the result is not a bundle", async () => {
            const client = window.FHIR.client({ serviceUrl: mockUrl });
            mockServer.mock({
                headers: { "content-type": "application/json" },
                status: 200,
                body: {
                    resourceType: "Patient",
                    id: "2e27c71e-30c8-4ceb-8c1c-5641e066c0a4"
                }
            });
            const result = await client.request(
                "/Patient/2e27c71e-30c8-4ceb-8c1c-5641e066c0a4",
                { pageLimit: 1 }
            );
            expect(result).to.include({
                resourceType: "Patient",
                id: "2e27c71e-30c8-4ceb-8c1c-5641e066c0a4"
            });
        });

        it ("can fetch a bundle", async () => {
            const client = window.FHIR.client({ serviceUrl: mockUrl });
            mockServer.mock({
                headers: { "content-type": "application/json" },
                status: 200,
                body: {
                    resourceType: "Bundle",
                    entry: []
                }
            });
            const result = await client.request("/Patient");
            expect(result).to.include({ resourceType: "Bundle" });
            expect(result).to.include("entry");
        });

        it ("does not return an array if pageLimit is 1", async () => {
            const client = window.FHIR.client({ serviceUrl: mockUrl });
            mockServer.mock({
                headers: { "content-type": "application/json" },
                status: 200,
                body: {
                    resourceType: "Bundle",
                    entry: []
                }
            });
            const result = await client.request("/Patient", { pageLimit: 1 });
            expect(result).to.include({ resourceType: "Bundle" });
            expect(result).to.include("entry");
        });

        it ("can fetch multiple pages", async () => {
            const client = window.FHIR.client({ serviceUrl: mockUrl });
            // Page 1
            mockServer.mock({
                headers: { "content-type": "application/json" },
                status: 200,
                body: {
                    resourceType: "Bundle",
                    entry: [],
                    link: [{ relation: "next", url: "whatever" }]
                }
            });

            // Page 2
            mockServer.mock({
                headers: { "content-type": "application/json" },
                status: 200,
                body: {
                    resourceType: "Bundle",
                    entry: []
                }
            });
            const result = await client.request("/Patient", { pageLimit: 2 });
            expect(result).to.be.an.array();
            expect(result.length).to.equal(2);
            expect(result[0]).to.include({ resourceType: "Bundle" });
            expect(result[0]).to.include("entry");
            expect(result[1]).to.include({ resourceType: "Bundle" });
            expect(result[1]).to.include("entry");
        });

        it("returns aan array if pageLimit is different than 1, even if there is only one page", async () => {
            const client = window.FHIR.client({ serviceUrl: mockUrl });
            mockServer.mock({
                headers: { "content-type": "application/json" },
                status: 200,
                body: {
                    resourceType: "Bundle",
                    entry: []
                }
            });
            const result = await client.request("/Practitioner", { pageLimit: 0 });
            expect(result).to.be.an.array();
            expect(result.length).to.equal(1);
            expect(result[0]).to.include({ resourceType: "Bundle" });
            expect(result[0]).to.include("entry");
        });

        it ("can fetch all pages", async () => {
            const client = window.FHIR.client({ serviceUrl: mockUrl });

            // Page 1
            mockServer.mock({
                headers: { "content-type": "application/json" },
                status: 200,
                body: {
                    resourceType: "Bundle",
                    entry: [],
                    link: [{ relation: "next", url: "whatever" }]
                }
            });

            // Page 2
            mockServer.mock({
                headers: { "content-type": "application/json" },
                status: 200,
                body: {
                    resourceType: "Bundle",
                    entry: []
                }
            });

            const result = await client.request("/Patient", { pageLimit: 0 });
            expect(result).to.be.an.array();
            expect(result.length).to.equal(2);
        });

        it ("onPage callback", async () => {
            const client = window.FHIR.client({ serviceUrl: mockUrl });
            const pages = [];
            const onPage = page => pages.push(page);

            // Page 1
            mockServer.mock({
                headers: { "content-type": "application/json" },
                status: 200,
                body: {
                    resourceType: "Bundle",
                    pageId: 1,
                    entry: [],
                    link: [{ relation: "next", url: "whatever" }]
                }
            });

            // Page 2
            mockServer.mock({
                headers: { "content-type": "application/json" },
                status: 200,
                body: {
                    resourceType: "Bundle",
                    pageId: 2,
                    entry: []
                }
            });

            const result = await client.request("/Patient", {
                pageLimit: 0,
                onPage
            });
            expect(result, "Resolves with an object").to.equal(null);
            expect(pages.length, "onPage should be called twice").to.equal(2);
            expect(pages[0]).to.include({ pageId: 1 });
            expect(pages[1]).to.include({ pageId: 2 });
        });

        it ("stops fetching pages if onPage throws", async () => {
            const client = window.FHIR.client({ serviceUrl: mockUrl });
            const pages = [];
            const onPage = page => {
                pages.push(page);
                throw new Error("test error");
            };

            // Page 1
            mockServer.mock({
                headers: { "content-type": "application/json" },
                status: 200,
                body: {
                    resourceType: "Bundle",
                    pageId: 1,
                    entry: [],
                    link: [{ relation: "next", url: "whatever" }]
                }
            });

            await client.request("/Patient", {
                pageLimit: 0,
                onPage
            }).catch(error => {
                expect(error).to.be.error("Error", "test error");
            });
            expect(pages.length, "onPage should be called once").to.equal(1);
            expect(pages[0]).to.include({ pageId: 1 });
        });

        it ("stops fetching pages if onPage rejects", async () => {
            const client = window.FHIR.client({ serviceUrl: mockUrl });
            const pages = [];
            const onPage = page => {
                pages.push(page);
                return Promise.reject(new Error("test error"));
            };

            // Page 1
            mockServer.mock({
                headers: { "content-type": "application/json" },
                status: 200,
                body: {
                    resourceType: "Bundle",
                    pageId: 1,
                    entry: [],
                    link: [{ relation: "next", url: "whatever" }]
                }
            });

            await client.request("/Patient", {
                pageLimit: 0,
                onPage
            }).catch(error => {
                expect(error).to.be.error("Error", "test error");
            });
            expect(pages.length, "onPage should be called once").to.equal(1);
            expect(pages[0]).to.include({ pageId: 1 });
        });

        it ("awaits for the onPage callback", async () => {
            const client = window.FHIR.client({ serviceUrl: mockUrl });
            const pages = [];
            const onPage = page => {
                return new Promise(resolve => {
                    setTimeout(() => {
                        pages.push(page);
                        resolve();
                    }, 100);
                });
            };
                

            // Page 1
            mockServer.mock({
                headers: { "content-type": "application/json" },
                status: 200,
                body: {
                    resourceType: "Bundle",
                    pageId: 1,
                    entry: [],
                    link: [{ relation: "next", url: "whatever" }]
                }
            });

            // Page 2
            mockServer.mock({
                headers: { "content-type": "application/json" },
                status: 200,
                body: {
                    resourceType: "Bundle",
                    pageId: 2,
                    entry: []
                }
            });

            const result = await client.request("/Patient", {
                pageLimit: 0,
                onPage
            });
            expect(result, "Resolves with an object").to.equal(null);
            expect(pages.length, "onPage should be called twice").to.equal(2);
            expect(pages[0]).to.include({ pageId: 1 });
            expect(pages[1]).to.include({ pageId: 2 });
        });

        it ("can resolve refs on single resource", async () => {
            const client = window.FHIR.client({ serviceUrl: mockUrl });
            
            // Main page
            mockServer.mock({
                headers: { "content-type": "application/json" },
                status: 200,
                body: {
                    resourceType: "Patient",
                    id: "id",
                    ref1: {
                        reference: "whatever"
                    }
                }
            });

            // Referenced page
            mockServer.mock({
                headers: { "content-type": "application/json" },
                status: 200,
                body: {
                    resourceType: "Ref",
                    id: "Ref-id"
                }
            });

            const result = await client.request(
                "/Patient/id",
                { resolveReferences: "ref1" }
            );
            expect(result).to.equal({
                resourceType: "Patient",
                id: "id",
                ref1: {
                    resourceType: "Ref",
                    id: "Ref-id"
                }
            });
        });

        it ("can resolve refs on single resource with `graph: false`", async () => {
            const client = window.FHIR.client({ serviceUrl: mockUrl });
            
            // Main page
            mockServer.mock({
                headers: { "content-type": "application/json" },
                status: 200,
                body: {
                    resourceType: "Patient",
                    id: "id",
                    ref1: {
                        reference: "whatever"
                    }
                }
            });

            // Referenced page
            mockServer.mock({
                headers: { "content-type": "application/json" },
                status: 200,
                body: {
                    resourceType: "Ref",
                    id: "Ref-id"
                }
            });

            const result = await client.request(
                "/Patient/id",
                {
                    resolveReferences: "ref1",
                    graph: false
                }
            );
            expect(result).to.equal({
                data: {
                    resourceType: "Patient",
                    id: "id",
                    ref1: {
                        reference: "whatever"
                    }
                },
                references: {
                    whatever: {
                        resourceType: "Ref",
                        id: "Ref-id"
                    }
                }
            });
        });

        it ("can resolve refs on pages", async () => {
            const client = window.FHIR.client({ serviceUrl: mockUrl });
            
            // Main page 1
            mockServer.mock({
                headers: { "content-type": "application/json" },
                status: 200,
                body: {
                    resourceType: "Bundle",
                    pageId: 1,
                    link: [{ relation: "next", url: "whatever" }],
                    entry: [{
                        resource: {
                            resourceType: "Patient",
                            id: "pt-1",
                            ref1: {
                                reference: "whatever-1"
                            }
                        }
                    }]
                }
            });

            // Referenced page 1
            mockServer.mock({
                headers: { "content-type": "application/json" },
                status: 200,
                body: {
                    resourceType: "Ref",
                    id: "Ref-whatever-1"
                }
            });

            // Main page 2
            mockServer.mock({
                headers: { "content-type": "application/json" },
                status: 200,
                body: {
                    resourceType: "Bundle",
                    pageId: 2,
                    entry: [{
                        resource: {
                            resourceType: "Patient",
                            id: "pt-2",
                            ref1: {
                                reference: "whatever-2"
                            }
                        }
                    }]
                }
            });

            // Referenced page 2
            mockServer.mock({
                headers: { "content-type": "application/json" },
                status: 200,
                body: {
                    resourceType: "Ref",
                    id: "Ref-whatever-2"
                }
            });

            const result = await client.request(
                "/Patient",
                {
                    resolveReferences: "ref1",
                    pageLimit: 0
                }
            );
            expect(result).to.equal([
                {
                    resourceType: "Bundle",
                    pageId: 1,
                    link: [{ relation: "next", url: "whatever" }],
                    entry: [{
                        resource: {
                            resourceType: "Patient",
                            id: "pt-1",
                            ref1: {
                                resourceType: "Ref",
                                id: "Ref-whatever-1"
                            }
                        }
                    }]
                },
                {
                    resourceType: "Bundle",
                    pageId: 2,
                    entry: [{
                        resource: {
                            resourceType: "Patient",
                            id: "pt-2",
                            ref1: {
                                resourceType: "Ref",
                                id: "Ref-whatever-2"
                            }
                        }
                    }]
                }
            ]);
        });

        it ("can resolve refs on pages with `graph: false`", async () => {
            const client = window.FHIR.client({ serviceUrl: mockUrl });
            
            // Main page 1
            mockServer.mock({
                headers: { "content-type": "application/json" },
                status: 200,
                body: {
                    resourceType: "Bundle",
                    pageId: 1,
                    link: [{ relation: "next", url: "whatever" }],
                    entry: [{
                        resource: {
                            resourceType: "Patient",
                            id: "pt-1",
                            ref1: {
                                reference: "Ref-whatever-1"
                            }
                        }
                    }]
                }
            });

            // Referenced page 1
            mockServer.mock({
                headers: { "content-type": "application/json" },
                status: 200,
                body: {
                    resourceType: "Ref",
                    id: "Ref-whatever-1"
                }
            });

            // Main page 2
            mockServer.mock({
                headers: { "content-type": "application/json" },
                status: 200,
                body: {
                    resourceType: "Bundle",
                    pageId: 2,
                    entry: [{
                        resource: {
                            resourceType: "Patient",
                            id: "pt-2",
                            ref1: {
                                reference: "Ref-whatever-2"
                            }
                        }
                    }]
                }
            });

            // Referenced page 2
            mockServer.mock({
                headers: { "content-type": "application/json" },
                status: 200,
                body: {
                    resourceType: "Ref",
                    id: "Ref-whatever-2"
                }
            });

            const result = await client.request(
                "/Patient",
                {
                    resolveReferences: "ref1",
                    pageLimit: 0,
                    graph: false
                }
            );
            expect(result).to.equal({
                data: [
                    {
                        resourceType: "Bundle",
                        pageId: 1,
                        link: [{ relation: "next", url: "whatever" }],
                        entry: [{
                            resource: {
                                resourceType: "Patient",
                                id: "pt-1",
                                ref1: {
                                    reference: "Ref-whatever-1"
                                }
                            }
                        }]
                    },
                    {
                        resourceType: "Bundle",
                        pageId: 2,
                        entry: [{
                            resource: {
                                resourceType: "Patient",
                                id: "pt-2",
                                ref1: {
                                    reference: "Ref-whatever-2"
                                }
                            }
                        }]
                    }
                ],
                references: {
                    "Ref-whatever-1": {
                        resourceType: "Ref",
                        id: "Ref-whatever-1"
                    },
                    "Ref-whatever-2": {
                        resourceType: "Ref",
                        id: "Ref-whatever-2"
                    }
                }
            });
        });

        it ("can resolve refs on pages with `onPage`", async () => {
            const client = window.FHIR.client({ serviceUrl: mockUrl });
            
            // Main page 1
            mockServer.mock({
                headers: { "content-type": "application/json" },
                status: 200,
                body: {
                    resourceType: "Bundle",
                    pageId: 1,
                    link: [{ relation: "next", url: "whatever" }],
                    entry: [{
                        resource: {
                            resourceType: "Patient",
                            id: "pt-1",
                            ref1: {
                                reference: "whatever-1"
                            }
                        }
                    }]
                }
            });

            // Referenced page 1
            mockServer.mock({
                headers: { "content-type": "application/json" },
                status: 200,
                body: {
                    resourceType: "Ref",
                    id: "Ref-whatever-1"
                }
            });

            // Main page 2
            mockServer.mock({
                headers: { "content-type": "application/json" },
                status: 200,
                body: {
                    resourceType: "Bundle",
                    pageId: 2,
                    entry: [{
                        resource: {
                            resourceType: "Patient",
                            id: "pt-2",
                            ref1: {
                                reference: "whatever-2"
                            }
                        }
                    }]
                }
            });

            // Referenced page 2
            mockServer.mock({
                headers: { "content-type": "application/json" },
                status: 200,
                body: {
                    resourceType: "Ref",
                    id: "Ref-whatever-2"
                }
            });

            const pages = [];
            const result = await client.request(
                "/Patient",
                {
                    resolveReferences: "ref1",
                    pageLimit: 0,
                    onPage(data) {
                        pages.push(data);
                    }
                }
            );
            expect(result).to.equal(null);
            expect(pages).to.equal([
                {
                    resourceType: "Bundle",
                    pageId: 1,
                    link: [{ relation: "next", url: "whatever" }],
                    entry: [{
                        resource: {
                            resourceType: "Patient",
                            id: "pt-1",
                            ref1: {
                                resourceType: "Ref",
                                id: "Ref-whatever-1"
                            }
                        }
                    }]
                },
                {
                    resourceType: "Bundle",
                    pageId: 2,
                    entry: [{
                        resource: {
                            resourceType: "Patient",
                            id: "pt-2",
                            ref1: {
                                resourceType: "Ref",
                                id: "Ref-whatever-2"
                            }
                        }
                    }]
                }
            ]);
        });

        it ("can resolve refs on pages with `onPage` and `graph: false`", async () => {
            const client = window.FHIR.client({ serviceUrl: mockUrl });
            
            // Main page 1
            mockServer.mock({
                headers: { "content-type": "application/json" },
                status: 200,
                body: {
                    resourceType: "Bundle",
                    pageId: 1,
                    link: [{ relation: "next", url: "whatever" }],
                    entry: [{
                        resource: {
                            resourceType: "Patient",
                            id: "pt-1",
                            ref1: {
                                reference: "whatever-1"
                            }
                        }
                    }]
                }
            });

            // Referenced page 1
            mockServer.mock({
                headers: { "content-type": "application/json" },
                status: 200,
                body: {
                    resourceType: "Ref",
                    id: "Ref-whatever-1"
                }
            });

            // Main page 2
            mockServer.mock({
                headers: { "content-type": "application/json" },
                status: 200,
                body: {
                    resourceType: "Bundle",
                    pageId: 2,
                    entry: [{
                        resource: {
                            resourceType: "Patient",
                            id: "pt-2",
                            ref1: {
                                reference: "whatever-2"
                            }
                        }
                    }]
                }
            });

            // Referenced page 2
            mockServer.mock({
                headers: { "content-type": "application/json" },
                status: 200,
                body: {
                    resourceType: "Ref",
                    id: "Ref-whatever-2"
                }
            });

            const pages = [];
            const refs = [];
            const result = await client.request(
                "/Patient",
                {
                    resolveReferences: "ref1",
                    pageLimit: 0,
                    graph: false,
                    onPage(data, references) {
                        pages.push(data);
                        refs.push(references);
                    }
                }
            );
            expect(result).to.equal(null);
            expect(pages).to.equal([
                {
                    resourceType: "Bundle",
                    pageId: 1,
                    link: [{ relation: "next", url: "whatever" }],
                    entry: [{
                        resource: {
                            resourceType: "Patient",
                            id: "pt-1",
                            ref1: {
                                reference: "whatever-1"
                            }
                        }
                    }]
                },
                {
                    resourceType: "Bundle",
                    pageId: 2,
                    entry: [{
                        resource: {
                            resourceType: "Patient",
                            id: "pt-2",
                            ref1: {
                                reference: "whatever-2"
                            }
                        }
                    }]
                }
            ]);
            expect(refs).to.equal([
                {
                    "whatever-1": {
                        resourceType: "Ref",
                        id: "Ref-whatever-1"
                    }
                },
                {
                    "whatever-1": {
                        resourceType: "Ref",
                        id: "Ref-whatever-1"
                    },
                    "whatever-2": {
                        resourceType: "Ref",
                        id: "Ref-whatever-2"
                    }
                }
            ]);
        });
        it ("can refresh");
        it ("can not refresh if useRefreshToken is false");
    });

    it ("client.server", () => {
        const client1 = new window.FHIR.client({
            serviceUrl: "http://localhost"
        });
        expect(client1.server).to.equal({
            serviceUrl: "http://localhost",
            auth: { type: "none" }
        });

        const client2 = new window.FHIR.client({
            serviceUrl: "http://localhost",
            auth: {
                type: "basic",
                username: "test-username",
                password: "test-password"
            }
        });
        expect(client2.server).to.equal({
            serviceUrl: "http://localhost",
            auth: {
                type: "basic",
                username: "test-username",
                password: "test-password"
            }
        });

        const client3 = new window.FHIR.client({
            serviceUrl: "http://localhost",
            auth: {
                type: "bearer",
                token: "test-token"
            }
        });
        expect(client3.server).to.equal({
            serviceUrl: "http://localhost",
            auth: {
                type: "bearer",
                token: "test-token"
            }
        });
    });

    it ("client.userId", () => {
        const client1 = new window.FHIR.client({
            serviceUrl: "http://localhost"
        });
        expect(client1.userId).to.equal(undefined);
        const client2 = new window.FHIR.client({
            serviceUrl: "http://localhost",
            userId: "test-userId"
        });
        expect(client2.userId).to.equal("test-userId");
    });

    it ("client.patient");
    it ("client.user");
    it ("client.authenticated");
    it ("client.get");
    it ("client.getBinary");
    it ("client.fetchBinary");
    
    describe("client.api", () => {
        it ("conformance", async () => {
            const client = window.FHIR.client({
                serviceUrl: mockUrl,
                auth: {
                    type: "none"
                }
            });
            mockServer.mock({
                headers: {
                    "content-type": "application/json"
                },
                status: 200,
                body: {
                    conformance: true
                }
            });
            const data = await client.api.conformance({}).catch((e) => {
                console.error(e);
                throw new Error("client.api.conformance({}) should not throw");
            });
            expect(data).to.equal({ conformance: true });
        });
        // it ("document");
        // it ("profile");
        // it ("transaction");
        // it ("history");
        // it ("typeHistory");
        // it ("resourceHistory");
        it ("read", async () => {
            const client = new window.FHIR.client({
                serviceUrl: OPEN_FHIR_SERVER,
                auth: {
                    type: "none"
                }
            });
            await client.api.read({
                type: "Patient",
                id: "eb3271e1-ae1b-4644-9332-41e32c829486"
            });
        });
        // it ("vread");
        // it ("delete");
        // it ("create");
        // it ("validate");
        // it ("search");
        // it ("update");
        // it ("nextPage");
        // it ("prevPage");
        // it ("resolve");
        // it ("drain");
        // it ("fetchAll", async () => {
        //     const client = new window.FHIR.client({
        //         serviceUrl: OPEN_FHIR_SERVER,
        //         auth: {
        //             type: "none"
        //         }
        //     });
        //     await client.api.fetchAll({
        //         type: "Patient"
        //     });
        // });
        // it ("fetchAllWithReferences", async () => {
        //     const client = new window.FHIR.client({
        //         serviceUrl: OPEN_FHIR_SERVER,
        //         auth: {
        //             type: "none"
        //         }
        //     });
        //     await client.api.fetchAllWithReferences({
        //         type: "Patient"
        //     });
        // });
    });

    // it ("user.read");
    // it ("getBinary");
    // it ("fetchBinary");

    it ("handles json responses with no body", async () => {
        const client = new FhirClient({
            serviceUrl: mockUrl
        });

        mockServer.mock({
            headers: {
                "content-type": "application/json"
            },
            status: 201
        });

        const data = await client.get({ resource: "Patient", id: 5 }).catch(() => {
            throw new Error("json response with no body should not throw");
        });
        
        expect(data).to.equal(null);
           
        // console.log(client)
        //     .catch(ex => { failure = ex });

        // // console.log(failure)
        // expect(failure).to.be.an.error();
        // expect(failure.name).to.equal("HTTPError");
        // expect(failure.status).to.equal(404);
        // expect(failure.statusCode).to.equal(404);
        // expect(failure.statusText).to.equal("Not Found");
        // expect(failure.message).to.equal("Could not fetch Patient NoSuchId");

        // expect(client.get({ resource: "Patient", id: "NoSuchId" })).to.reject()
        // .fail(
        //     // function() {
        //     //     console.log("success", arguments);
        //     // },
        //     function() {
        //         console.log("error", arguments);
        //     }
        // );
    });

});
