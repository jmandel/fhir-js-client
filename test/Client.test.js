const { expect } = require("@hapi/code");
const lab        = require("@hapi/lab").script();
const Lib        = require("../src/lib");
Lib.debug = function(...args) {
    debugLog.push(args);
};
const Client     = require("../src/Client");
const { KEY }    = require("../src/smart");


// Mocks
const mockServer     = require("./mocks/mockServer");
const ServerEnv      = require("./mocks/ServerEnvironment");
const BrowserEnv     = require("./mocks/BrowserEnvironment");
const BrowserEnvFhir = require("./mocks/BrowserEnvironmentWithFhirJs");


const { it, describe, before, after, afterEach } = lab;
exports.lab = lab;

let mockDataServer, mockUrl, debugLog = [];

before(() => {
    return new Promise((resolve, reject) => {

        mockDataServer = mockServer.listen(null, "0.0.0.0", error => {
            if (error) {
                return reject(error);
            }
            let addr = mockDataServer.address();
            mockUrl = `http://127.0.0.1:${addr.port}`;
            // console.log(`Mock Data Server listening at ${mockUrl}`);
            resolve();
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
                // console.log("Mock Data Server CLOSED!");
                resolve();
            });
        });
    }
});

afterEach(() => {
    mockServer.clear();
    debugLog = [];
});




function crossPlatformTest(callback) {
    const tests = {
        "works in the browser": new BrowserEnv(),
        "works on the server" : new ServerEnv()
    };

    for (let name in tests) {
        it (name, () => callback(tests[name]));
    }
}

describe("FHIR.client", () => {

    describe("constructor", () => {
        it ("throws if initialized without arguments", () => {
            expect(() => new Client()).to.throw();
        });

        it ("throws if initialized without serverUrl", () => {
            expect(() => new Client({}, {})).to.throw();
        });

        it ("throws if initialized with invalid serverUrl", () => {
            expect(() => new Client({}, "invalid-url")).to.throw();
        });

        it ("accepts string as second argument", () => {
            expect(new Client({}, "http://test").state).to.equal({ serverUrl: "http://test" });
        });
    });

    describe("patient.read", () => {

        describe("rejects with no patient", () => {
            crossPlatformTest(async (env) => {
                const client = new Client(env, {
                    serverUrl: mockUrl,
                    tokenResponse: {}
                });
                await expect(client.patient.read()).to.reject(
                    Error, "Patient is not available"
                );
            });
        });

        const mock = {
            headers: { "content-type": "application/json" },
            status: 200,
            body: {
                resourceType: "Patient",
                id: "2e27c71e-30c8-4ceb-8c1c-5641e066c0a4"
            }
        };
        const tests = {
            "works in the browser": new BrowserEnv(),
            "works on the server" : new ServerEnv()
        };

        for (let name in tests) {
            it (name, async () => {
                const client = new Client(tests[name], {
                    serverUrl: mockUrl,
                    tokenResponse: {
                        patient: "2e27c71e-30c8-4ceb-8c1c-5641e066c0a4"
                    }
                });
                mockServer.mock(mock);
                const result = await client.patient.read();
                expect(result).to.include({ resourceType: "Patient", id: "2e27c71e-30c8-4ceb-8c1c-5641e066c0a4" });
            });
        }
    });

    describe("encounter.read", () => {
        describe("rejects with no encounter", () => {
            crossPlatformTest(async (env) => {
                const client = new Client(env, {
                    serverUrl: mockUrl,
                    tokenResponse: {}
                });
                await expect(client.encounter.read()).to.reject(
                    Error, "Encounter is not available"
                );

                mockServer.mock({
                    headers: { "content-type": "application/json" },
                    status: 200,
                    body: { id: "encounter-id" }
                });
                client.state.tokenResponse.encounter = "whatever";
                const encounter = await client.encounter.read();
                expect(encounter).to.equal({ id: "encounter-id" });
            });
        });
    });

    describe("user.read", () => {
        describe("rejects with no user", () => {
            crossPlatformTest(async (env) => {
                const client = new Client(env, {
                    serverUrl: mockUrl,
                    tokenResponse: {}
                });
                await expect(client.user.read()).to.reject(
                    Error, "User is not available"
                );
                mockServer.mock({
                    headers: { "content-type": "application/json" },
                    status: 200,
                    body: { id: "user-id" }
                });
                client.state.tokenResponse.id_token =
                "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9." +
                "eyJwcm9maWxlIjoiUHJhY3RpdGlvbmVyL3NtYXJ0LVByYWN0aXRpb2" +
                "5lci03MjA4MDQxNiIsImZoaXJVc2VyIjoiUHJhY3RpdGlvbmVyL3Nt" +
                "YXJ0LVByYWN0aXRpb25lci03MjA4MDQxNiIsInN1YiI6IjM2YTEwYm" +
                "M0ZDJhNzM1OGI0YWZkYWFhZjlhZjMyYmFjY2FjYmFhYmQxMDkxYmQ0" +
                "YTgwMjg0MmFkNWNhZGQxNzgiLCJpc3MiOiJodHRwOi8vbGF1bmNoLn" +
                "NtYXJ0aGVhbHRoaXQub3JnIiwiaWF0IjoxNTU5MzkyMjk1LCJleHAi" +
                "OjE1NTkzOTU4OTV9.niEs55G4AFJZtU_b9Y1Y6DQmXurUZZkh3WCud" +
                "ZgwvYasxVU8x3gJiX3jqONttqPhkh7418EFssCKnnaBlUDwsbhp7xd" +
                "WN4o1L1NvH4bp_R_zJ25F1s6jLmNm2Qp9LqU133PEdcRIqQPgBMyZB" +
                "WUTyxQ9ihKY1RAjlztAULQ3wKea-rfe0BXJZeUJBsQPzYCnbKY1dON" +
                "_NRd8N9pTImqf41MpIbEe7YEOHuirIb6HBpurhAHjTLDv1IuHpEAOx" +
                "pmtxVVHiVf-FYXzTFmn4cGe2PsNJfBl8R_zow2n6qaSANdvSxJDE4D" +
                "UgIJ6H18wiSJJHp6Plf_bapccAwxbx-zZCw";
                const user = await client.user.read();
                expect(user).to.equal({ id: "user-id" });
            });
        });
    });

    describe("fhir.js api", () => {
        it ("works in the browser", async () => {
            const env    = new BrowserEnvFhir();
            const client = new Client(env, {
                serverUrl: "https://r2.smarthealthit.org",
                tokenResponse: {
                    patient: "bd7cb541-732b-4e39-ab49-ae507aa49326"
                }
            });
            await client.api.read({ type: "Patient", id: "bd7cb541-732b-4e39-ab49-ae507aa49326" });
            await client.api.search({ type: "Patient" });
            await client.patient.api.read({ type: "Patient", id: "bd7cb541-732b-4e39-ab49-ae507aa49326" });
        });
    });

    describe("client.request", () => {
        it("rejects if no url is provided", async () => {
            const client = new Client({}, "http://localhost");
            await expect(client.request()).to.reject();
        });

        it("rejects on 401 with no refresh token", async () => {
            const client = new Client({}, mockUrl);
            const mock = {
                status: 401,
                body: "Unauthorized"
            };
            mockServer.mock(mock);
            await expect(client.request("/")).to.reject();
        });

        it("rejects on 401 with useRefreshToken = false", async () => {
            const client = new Client({}, {
                serverUrl: mockUrl,
                tokenResponse: {
                    refresh_token: "whatever"
                }
            });
            const mock = {
                status: 401,
                body: "Unauthorized"
            };
            mockServer.mock(mock);
            await expect(client.request("/", { useRefreshToken: false })).to.reject();
        });

        describe ("can fetch single resource", () => {
            const mock = {
                headers: { "content-type": "application/json" },
                status: 200,
                body: { id: "patient-id" }
            };
            const tests = {
                "works in the browser": new BrowserEnv(),
                "works on the server" : new ServerEnv()
            };
    
            for (let name in tests) {
                it (name, async () => {
                    const client = new Client(tests[name], { serverUrl: mockUrl });
                    mockServer.mock(mock);
                    const result = await client.request("/Patient/patient-id");
                    expect(result).to.include({ id: "patient-id" });
                });
            }
        });

        describe ("ignores pageLimit if the result is not a bundle", () => {
            const mock = {
                headers: { "content-type": "application/json" },
                status: 200,
                body: { resourceType: "Patient" }
            };
            const tests = {
                "works in the browser": new BrowserEnv(),
                "works on the server" : new ServerEnv()
            };
            for (let name in tests) {
                it (name, async () => {
                    const client = new Client(tests[name], { serverUrl: mockUrl });
                    mockServer.mock(mock);
                    const result = await client.request("/Patient", { pageLimit: 1 });
                    expect(result).to.include({ resourceType: "Patient" });
                });
            }
        });

        describe("can fetch a bundle", () => {
            const mock = {
                headers: { "content-type": "application/json" },
                status: 200,
                body: { resourceType: "Bundle", entry: [] }
            };
            const tests = {
                "works in the browser": new BrowserEnv(),
                "works on the server" : new ServerEnv()
            };
    
            for (let name in tests) {
                it (name, async () => {
                    const client = new Client(tests[name], { serverUrl: mockUrl });
                    mockServer.mock(mock);
                    const result = await client.request("/Patient");
                    expect(result).to.include({ resourceType: "Bundle" });
                    expect(result).to.include("entry");
                });
            }
        });

        describe ("does not return an array if pageLimit is 1", () => {
            crossPlatformTest(async (env) => {
                const client = new Client(env, { serverUrl: mockUrl });
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
        });

        describe ("can fetch multiple pages", () => {
            crossPlatformTest(async (env) => {
                const client = new Client(env, { serverUrl: mockUrl });
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
        });

        describe ("returns aan array if pageLimit is different than 1, even if there is only one page", () => {
            crossPlatformTest(async (env) => {
                const client = new Client(env, { serverUrl: mockUrl });
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
        });

        describe ("can fetch all pages", () => {
            crossPlatformTest(async (env) => {
                const client = new Client(env, { serverUrl: mockUrl });

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
        });

        describe ("onPage callback", () => {
            crossPlatformTest(async (env) => {
                const client = new Client(env, { serverUrl: mockUrl });
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
        });

        describe ("stops fetching pages if onPage throws", () => {
            crossPlatformTest(async (env) => {
                const client = new Client(env, { serverUrl: mockUrl });
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
        });

        describe ("stops fetching pages if onPage rejects", () => {
            crossPlatformTest(async (env) => {
                const client = new Client(env, { serverUrl: mockUrl });
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
        });

        describe ("awaits for the onPage callback", () => {
            crossPlatformTest(async (env) => {
                const client = new Client(env, { serverUrl: mockUrl });
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
        });

        describe ("can resolve refs on single resource", () => {
            crossPlatformTest(async (env) => {
                const client = new Client(env, { serverUrl: mockUrl });
            
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
        });

        describe ("can resolve refs on single resource with `graph: false`", () => {
            crossPlatformTest(async (env) => {
                const client = new Client(env, { serverUrl: mockUrl });
            
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
        });

        describe ("can resolve refs on pages", () => {
            crossPlatformTest(async (env) => {
                const client = new Client(env, { serverUrl: mockUrl });
                
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
        });

        describe ("can resolve refs on pages with `graph: false`", () => {
            crossPlatformTest(async (env) => {
                const client = new Client(env, { serverUrl: mockUrl });
                
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
        });

        describe ("can resolve refs on pages with `onPage`", () => {
            crossPlatformTest(async (env) => {
                const client = new Client(env, { serverUrl: mockUrl });
                
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
        });

        describe ("can resolve refs on pages with `onPage` and `graph: false`", () => {
            crossPlatformTest(async (env) => {
                const client = new Client(env, { serverUrl: mockUrl });
                
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
        });

        describe ("resolve all refs if it points to an array", () => {
            crossPlatformTest(async (env) => {
                const client = new Client(env, mockUrl);

                // Main page
                mockServer.mock({
                    headers: { "content-type": "application/json" },
                    status: 200,
                    body: {
                        resourceType: "Patient",
                        id: "id",
                        ref1: [
                            { reference: "whatever-1" },
                            { reference: "whatever-2" }
                        ]
                    }
                });

                // Referenced page 1
                mockServer.mock({
                    headers: { "content-type": "application/json" },
                    status: 200,
                    body: { resourceType: "Ref", id: "Ref-id-1" }
                });

                // Referenced page 2
                mockServer.mock({
                    headers: { "content-type": "application/json" },
                    status: 200,
                    body: { resourceType: "Ref", id: "Ref-id-2" }
                });

                const result = await client.request(
                    "/Patient/id",
                    { resolveReferences: "ref1" }
                );
                expect(result).to.equal({
                    resourceType: "Patient",
                    id: "id",
                    ref1: [
                        { resourceType: "Ref", id: "Ref-id-1" },
                        { resourceType: "Ref", id: "Ref-id-2" }
                    ]
                });
            });
        });
    });

    describe ("client.user", () => {
        const id_token = "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJwcm9maWxlIjoiUHJhY3RpdGlvbmVyL3NtYXJ0LVByYWN0aXRpb25lci03MjA4MDQxNiIsImZoaXJVc2VyIjoiUHJhY3RpdGlvbmVyL3NtYXJ0LVByYWN0aXRpb25lci03MjA4MDQxNiIsInN1YiI6IjM2YTEwYmM0ZDJhNzM1OGI0YWZkYWFhZjlhZjMyYmFjY2FjYmFhYmQxMDkxYmQ0YTgwMjg0MmFkNWNhZGQxNzgiLCJpc3MiOiJodHRwOi8vbGF1bmNoLnNtYXJ0aGVhbHRoaXQub3JnIiwiaWF0IjoxNTU5MzkyMjk1LCJleHAiOjE1NTkzOTU4OTV9.niEs55G4AFJZtU_b9Y1Y6DQmXurUZZkh3WCudZgwvYasxVU8x3gJiX3jqONttqPhkh7418EFssCKnnaBlUDwsbhp7xdWN4o1L1NvH4bp_R_zJ25F1s6jLmNm2Qp9LqU133PEdcRIqQPgBMyZBWUTyxQ9ihKY1RAjlztAULQ3wKea-rfe0BXJZeUJBsQPzYCnbKY1dON_NRd8N9pTImqf41MpIbEe7YEOHuirIb6HBpurhAHjTLDv1IuHpEAOxpmtxVVHiVf-FYXzTFmn4cGe2PsNJfBl8R_zow2n6qaSANdvSxJDE4DUgIJ6H18wiSJJHp6Plf_bapccAwxbx-zZCw";
        crossPlatformTest(async (env) => {
            const client1 = new Client(env, {
                serverUrl: mockUrl,
                tokenResponse: {}
            });
            expect(client1.user.id).to.equal(null);
            expect(client1.getUserId()).to.equal(null);
            expect(client1.getFhirUser()).to.equal(null);
            expect(client1.getUserType()).to.equal(null);

            const client2 = new Client(env, {
                serverUrl: mockUrl,
                tokenResponse: { id_token }
            });
            expect(client2.user.id).to.equal("smart-Practitioner-72080416");
            expect(client2.getUserId()).to.equal("smart-Practitioner-72080416");
            expect(client2.getFhirUser()).to.equal("Practitioner/smart-Practitioner-72080416");
            expect(client2.getUserType()).to.equal("Practitioner");
        });
    });

    describe ("client.getAuthorizationHeader", () => {
        crossPlatformTest(async (env) => {
            const client = new Client(env, {
                serverUrl: mockUrl,
                tokenResponse: {}
            });

            expect(client.getAuthorizationHeader()).to.equal(null);

            client.state.username = "my-username";
            expect(client.getAuthorizationHeader()).to.equal(null);

            client.state.password = "my-password";
            expect(client.getAuthorizationHeader()).to.equal(
                "Basic " + Buffer.from("my-username:my-password", "ascii").toString("base64")
            );

            client.state.tokenResponse.access_token = "my-token";
            expect(client.getAuthorizationHeader()).to.equal("Bearer my-token");
        });
    });

    it ("client.refresh validates state and throws if needed", async () => {

        expect(
            () => (new Client({}, {
                serverUrl: "http://whatever",
                tokenUri : "whatever",
                tokenResponse: {
                    access_token: "whatever",
                    scope       : "test"
                }
            }).refresh()),
            "throws with no refreshToken"
        ).to.throw(Error, /\brefresh_token\b/);

        expect(
            () => new Client({}, {
                serverUrl: "http://whatever",
                tokenResponse: {
                    access_token : "whatever",
                    refresh_token: "whatever",
                    scope        : "test"
                }
            }).refresh(),
            "throws with no tokenUri"
        ).to.throw(Error, /\btokenUri\b/);

        expect(
            () => new Client({}, {
                serverUrl: "http://whatever",
                tokenUri : "whatever",
                tokenResponse: {
                    access_token : "whatever",
                    refresh_token: "whatever",
                    scope        : "test"
                }
            }).refresh(),
            "throws with no online_access scope"
        ).to.throw(Error, /\bonline_access\b/);

        expect(
            () => new Client({}, {
                serverUrl: "http://whatever",
                tokenUri : "whatever",
                tokenResponse: {
                    access_token : "whatever",
                    refresh_token: "whatever"
                }
            }).refresh(),
            "throws with no scope"
        ).to.throw(Error, /\bonline_access\b/);

        await expect(
            (() => {
                const env = new BrowserEnv();
                mockServer.mock({
                    headers: { "content-type": "application/json" },
                    status: 200,
                    body: { result: false }
                });
                const client = new Client(env, {
                    serverUrl: "http://whatever",
                    tokenUri : mockUrl,
                    tokenResponse: {
                        access_token : "whatever",
                        refresh_token: "whatever",
                        scope        : "online_access"
                    }
                });
                return client.refresh();
            })(),
            "throws if the token endpoint does not return access_token"
        ).to.reject(Error, "No access token received");
    });

    it ("client.refresh", async () => {
        const env     = new BrowserEnv();
        const storage = env.getStorage();
        const key     = "my-key";
        const state = {
            serverUrl: mockUrl,
            tokenUri: mockUrl,
            tokenResponse: {
                "refresh_token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJjb250ZXh0Ijp7Im5lZWRfcGF0aWVudF9iYW5uZXIiOnRydWUsInNtYXJ0X3N0eWxlX3VybCI6Imh0dHBzOi8vbGF1bmNoLnNtYXJ0aGVhbHRoaXQub3JnL3NtYXJ0LXN0eWxlLmpzb24iLCJwYXRpZW50IjoiZWIzMjcxZTEtYWUxYi00NjQ0LTkzMzItNDFlMzJjODI5NDg2IiwiZW5jb3VudGVyIjoiMzFiMThhYTAtMGRhNy00NDYwLTk2MzMtMDRhZjQxNDY2ZDc2In0sImNsaWVudF9pZCI6Im15X3dlYl9hcHAiLCJzY29wZSI6Im9wZW5pZCBmaGlyVXNlciBvZmZsaW5lX2FjY2VzcyB1c2VyLyouKiBwYXRpZW50LyouKiBsYXVuY2gvZW5jb3VudGVyIGxhdW5jaC9wYXRpZW50IHByb2ZpbGUiLCJ1c2VyIjoiUHJhY3RpdGlvbmVyL3NtYXJ0LVByYWN0aXRpb25lci03MTQ4MjcxMyIsImlhdCI6MTU1ODcxMDk2NCwiZXhwIjoxNTkwMjQ2OTY1fQ.f5yNY-yKKDe0a59_eFgp6s0rHSgPLXgmAWDPz_hEUgs",
                "expires_in"   : 1,
                "access_token" : "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJuZWVkX3BhdGllbnRfYmFubmVyIjp0cnVlLCJzbWFydF9zdHlsZV91cmwiOiJodHRwczovL2xhdW5jaC5zbWFydGhlYWx0aGl0Lm9yZy9zbWFydC1zdHlsZS5qc29uIiwicGF0aWVudCI6ImViMzI3MWUxLWFlMWItNDY0NC05MzMyLTQxZTMyYzgyOTQ4NiIsImVuY291bnRlciI6IjMxYjE4YWEwLTBkYTctNDQ2MC05NjMzLTA0YWY0MTQ2NmQ3NiIsInJlZnJlc2hfdG9rZW4iOiJleUowZVhBaU9pSktWMVFpTENKaGJHY2lPaUpJVXpJMU5pSjkuZXlKamIyNTBaWGgwSWpwN0ltNWxaV1JmY0dGMGFXVnVkRjlpWVc1dVpYSWlPblJ5ZFdVc0luTnRZWEowWDNOMGVXeGxYM1Z5YkNJNkltaDBkSEJ6T2k4dmJHRjFibU5vTG5OdFlYSjBhR1ZoYkhSb2FYUXViM0puTDNOdFlYSjBMWE4wZVd4bExtcHpiMjRpTENKd1lYUnBaVzUwSWpvaVpXSXpNamN4WlRFdFlXVXhZaTAwTmpRMExUa3pNekl0TkRGbE16SmpPREk1TkRnMklpd2laVzVqYjNWdWRHVnlJam9pTXpGaU1UaGhZVEF0TUdSaE55MDBORFl3TFRrMk16TXRNRFJoWmpReE5EWTJaRGMySW4wc0ltTnNhV1Z1ZEY5cFpDSTZJbTE1WDNkbFlsOWhjSEFpTENKelkyOXdaU0k2SW05d1pXNXBaQ0JtYUdseVZYTmxjaUJ2Wm1ac2FXNWxYMkZqWTJWemN5QjFjMlZ5THlvdUtpQndZWFJwWlc1MEx5b3VLaUJzWVhWdVkyZ3ZaVzVqYjNWdWRHVnlJR3hoZFc1amFDOXdZWFJwWlc1MElIQnliMlpwYkdVaUxDSjFjMlZ5SWpvaVVISmhZM1JwZEdsdmJtVnlMM050WVhKMExWQnlZV04wYVhScGIyNWxjaTAzTVRRNE1qY3hNeUlzSW1saGRDSTZNVFUxT0RjeE1EazJOQ3dpWlhod0lqb3hOVGt3TWpRMk9UWTFmUS5mNXlOWS15S0tEZTBhNTlfZUZncDZzMHJIU2dQTFhnbUFXRFB6X2hFVWdzIiwidG9rZW5fdHlwZSI6ImJlYXJlciIsInNjb3BlIjoib3BlbmlkIGZoaXJVc2VyIG9mZmxpbmVfYWNjZXNzIHVzZXIvKi4qIHBhdGllbnQvKi4qIGxhdW5jaC9lbmNvdW50ZXIgbGF1bmNoL3BhdGllbnQgcHJvZmlsZSIsImNsaWVudF9pZCI6Im15X3dlYl9hcHAiLCJleHBpcmVzX2luIjozNjAwLCJpZF90b2tlbiI6ImV5SjBlWEFpT2lKS1YxUWlMQ0poYkdjaU9pSlNVekkxTmlKOS5leUp3Y205bWFXeGxJam9pVUhKaFkzUnBkR2x2Ym1WeUwzTnRZWEowTFZCeVlXTjBhWFJwYjI1bGNpMDNNVFE0TWpjeE15SXNJbVpvYVhKVmMyVnlJam9pVUhKaFkzUnBkR2x2Ym1WeUwzTnRZWEowTFZCeVlXTjBhWFJwYjI1bGNpMDNNVFE0TWpjeE15SXNJbUYxWkNJNkltMTVYM2RsWWw5aGNIQWlMQ0p6ZFdJaU9pSmtZakl6WkRCa1pUSTFOamM0WlRZM01EazVZbU0wTXpRek1qTmtZekJrT1RZMU1UTmlOVFV5TW1RMFlqYzBNV05pWVRNNVpqZGpPVEprTUdNME5tRmxJaXdpYVhOeklqb2lhSFIwY0RvdkwyeGhkVzVqYUM1emJXRnlkR2hsWVd4MGFHbDBMbTl5WnlJc0ltbGhkQ0k2TVRVMU9EY3hNRGsyTlN3aVpYaHdJam94TlRVNE56RTBOVFkxZlEuVzFPSmdWUl9wOTdERlRaSmZhLWI2aWRmNktZMTUtbE81WU9nNHROZkJ5X3dmUHVpbHBUeXZBcDFHRnc2TFpGMnFhNkFWYV9oc1BoXy1GSTJKNkN6MGlqZkFZbVMzdFZwYVZYSGhpMjZsUG5QdUIxVjFUbWJ6YVhDWmJYaC1pdjl4WTNZQXFFRTgyMjFjTXRzQ3FXUFM3aUlMYmJJZmozQnlNMm04aXNRVS1pOGhxLUdTV2ZKNTlwczRGMFZNdlI0QmlPUUdIOXQ5TFQ0TDVxNnNsLU9ONUpJVnJFdnEweFJQVjBrTnpqbUVheklLbV9MMllZM09yMVYwbE02Q0otM2U4RkdkUElIRlRpMjJXcVc1dXhBU2NDVm1hZ1h4S2l5T2xNRWc3dGtjUHA3MjJtS3B0MTMwT3lzaUZyOGpZaElYZkdhX3VGN0tDVFhTZ0RrZEV1WlNRIiwiaWF0IjoxNTU4NzEwOTY1LCJleHAiOjE1NTg3MTQ1NjV9.FDRzViWLg4rMfDzr7Bx01pt5t7CapzcJwQcaFTVcu3E",
                "scope": "online_access"
            },
            key
        };

        storage.set(KEY, key);
        storage.set(key, state);
        
        const client = new Client(env, state);
        // console.log("===> ", env, storage);

        const fakeTokenResponse = {
            headers: { "content-type": "application/json" },
            status: 200,
            body: {
                "expires_in": 3600,
                "access_token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJuZWVkX3BhdGllbnRfYmFubmVyIjp0cnVlLCJzbWFydF9zdHlsZV91cmwiOiJodHRwczovL2xhdW5jaC5zbWFydGhlYWx0aGl0Lm9yZy9zbWFydC1zdHlsZS5qc29uIiwicGF0aWVudCI6ImViMzI3MWUxLWFlMWItNDY0NC05MzMyLTQxZTMyYzgyOTQ4NiIsImVuY291bnRlciI6IjMxYjE4YWEwLTBkYTctNDQ2MC05NjMzLTA0YWY0MTQ2NmQ3NiIsInJlZnJlc2hfdG9rZW4iOiJleUowZVhBaU9pSktWMVFpTENKaGJHY2lPaUpJVXpJMU5pSjkuZXlKamIyNTBaWGgwSWpwN0ltNWxaV1JmY0dGMGFXVnVkRjlpWVc1dVpYSWlPblJ5ZFdVc0luTnRZWEowWDNOMGVXeGxYM1Z5YkNJNkltaDBkSEJ6T2k4dmJHRjFibU5vTG5OdFlYSjBhR1ZoYkhSb2FYUXViM0puTDNOdFlYSjBMWE4wZVd4bExtcHpiMjRpTENKd1lYUnBaVzUwSWpvaVpXSXpNamN4WlRFdFlXVXhZaTAwTmpRMExUa3pNekl0TkRGbE16SmpPREk1TkRnMklpd2laVzVqYjNWdWRHVnlJam9pTXpGaU1UaGhZVEF0TUdSaE55MDBORFl3TFRrMk16TXRNRFJoWmpReE5EWTJaRGMySW4wc0ltTnNhV1Z1ZEY5cFpDSTZJbTE1WDNkbFlsOWhjSEFpTENKelkyOXdaU0k2SW05d1pXNXBaQ0JtYUdseVZYTmxjaUJ2Wm1ac2FXNWxYMkZqWTJWemN5QjFjMlZ5THlvdUtpQndZWFJwWlc1MEx5b3VLaUJzWVhWdVkyZ3ZaVzVqYjNWdWRHVnlJR3hoZFc1amFDOXdZWFJwWlc1MElIQnliMlpwYkdVaUxDSjFjMlZ5SWpvaVVISmhZM1JwZEdsdmJtVnlMM050WVhKMExWQnlZV04wYVhScGIyNWxjaTAzTVRRNE1qY3hNeUlzSW1saGRDSTZNVFUxT0RjeE1EazJOQ3dpWlhod0lqb3hOVGt3TWpRMk9UWTFmUS5mNXlOWS15S0tEZTBhNTlfZUZncDZzMHJIU2dQTFhnbUFXRFB6X2hFVWdzIiwidG9rZW5fdHlwZSI6ImJlYXJlciIsInNjb3BlIjoib3BlbmlkIGZoaXJVc2VyIG9mZmxpbmVfYWNjZXNzIHVzZXIvKi4qIHBhdGllbnQvKi4qIGxhdW5jaC9lbmNvdW50ZXIgbGF1bmNoL3BhdGllbnQgcHJvZmlsZSIsImNsaWVudF9pZCI6Im15X3dlYl9hcHAiLCJleHBpcmVzX2luIjozNjAwLCJpZF90b2tlbiI6ImV5SjBlWEFpT2lKS1YxUWlMQ0poYkdjaU9pSlNVekkxTmlKOS5leUp3Y205bWFXeGxJam9pVUhKaFkzUnBkR2x2Ym1WeUwzTnRZWEowTFZCeVlXTjBhWFJwYjI1bGNpMDNNVFE0TWpjeE15SXNJbVpvYVhKVmMyVnlJam9pVUhKaFkzUnBkR2x2Ym1WeUwzTnRZWEowTFZCeVlXTjBhWFJwYjI1bGNpMDNNVFE0TWpjeE15SXNJbUYxWkNJNkltMTVYM2RsWWw5aGNIQWlMQ0p6ZFdJaU9pSmtZakl6WkRCa1pUSTFOamM0WlRZM01EazVZbU0wTXpRek1qTmtZekJrT1RZMU1UTmlOVFV5TW1RMFlqYzBNV05pWVRNNVpqZGpPVEprTUdNME5tRmxJaXdpYVhOeklqb2lhSFIwY0RvdkwyeGhkVzVqYUM1emJXRnlkR2hsWVd4MGFHbDBMbTl5WnlJc0ltbGhkQ0k2TVRVMU9EY3hNRGsyTlN3aVpYaHdJam94TlRVNE56RTBOVFkxZlEuVzFPSmdWUl9wOTdERlRaSmZhLWI2aWRmNktZMTUtbE81WU9nNHROZkJ5X3dmUHVpbHBUeXZBcDFHRnc2TFpGMnFhNkFWYV9oc1BoXy1GSTJKNkN6MGlqZkFZbVMzdFZwYVZYSGhpMjZsUG5QdUIxVjFUbWJ6YVhDWmJYaC1pdjl4WTNZQXFFRTgyMjFjTXRzQ3FXUFM3aUlMYmJJZmozQnlNMm04aXNRVS1pOGhxLUdTV2ZKNTlwczRGMFZNdlI0QmlPUUdIOXQ5TFQ0TDVxNnNsLU9ONUpJVnJFdnEweFJQVjBrTnpqbUVheklLbV9MMllZM09yMVYwbE02Q0otM2U4RkdkUElIRlRpMjJXcVc1dXhBU2NDVm1hZ1h4S2l5T2xNRWc3dGtjUHA3MjJtS3B0MTMwT3lzaUZyOGpZaElYZkdhX3VGN0tDVFhTZ0RrZEV1WlNRIiwiaWF0IjoxNTU4NzEwOTY1LCJleHAiOjE1NTg3MTQ1NjV9.FDRzViWLg4rMfDzr7Bx01pt5t7CapzcJwQcaFTVcu3E"
            }
        };

        mockServer.mock(fakeTokenResponse);

        // 1. Manual refresh
        await client.refresh();
        expect(client.state.tokenResponse.expires_in).to.equal(3600);

        // 2. Automatic refresh
        client.state.tokenResponse.expires_in = 0;
        mockServer.mock({ status: 401, body: "Unauthorized" });
        mockServer.mock(fakeTokenResponse);
        mockServer.mock({
            status: 200,
            headers: {
                "content-type": "application/json"
            },
            body: {
                msg: "successful after all"
            }
        });
        const result = await client.request("/Patient");
        expect(result).to.equal({ msg: "successful after all" });
    });

    describe("getPatientId() returns null without tokenResponse", () => {
        crossPlatformTest(async (env) => {
            const client = new Client(env, mockUrl);
            expect(client.getPatientId()).to.equal(null);
            expect(debugLog).to.equal([[
                "You are trying to get the ID of the selected patient " +
                "but your app needs to be authorized first. Please don't use " +
                "open fhir servers if you need to access launch context items " +
                "like the selected patient."
            ]]);
        });
    }); 

    describe("getPatientId() complains about authorizeUri", () => {
        crossPlatformTest(async (env) => {
            const client = new Client(env, {
                serverUrl: mockUrl,
                authorizeUri: "whatever"
            });
            expect(client.getPatientId()).to.equal(null);
            expect(debugLog).to.equal([[
                "You are trying to get the ID of the selected patient " +
                "but your app is not authorized yet."
            ]]);
        });
    });

    describe("getPatientId() complains about scopes", () => {
        crossPlatformTest(async (env) => {
            const client = new Client(env, {
                serverUrl: mockUrl,
                tokenResponse: {}
            });
            expect(client.getPatientId()).to.equal(null);
            expect(debugLog).to.equal([[
                "You are trying to get the ID of the selected patient " +
                "but you have not used the right scopes. Please add " +
                "'launch' or 'launch/patient' to the scopes you are " +
                "requesting and try again."
            ]]);
        });
    });

    describe("getPatientId() complains about server support", () => {
        crossPlatformTest(async (env) => {
            const client = new Client(env, {
                serverUrl: mockUrl,
                scope: "launch",
                tokenResponse: {}
            });
            expect(client.getPatientId()).to.equal(null);
            expect(debugLog).to.equal([[
                "The ID of the selected patient is not available. " +
                "Please check if your server supports that."
            ]]);
        });
    });

    describe("getEncounterId() returns null without tokenResponse", () => {
        crossPlatformTest(async (env) => {
            const client = new Client(env, mockUrl);
            expect(client.getEncounterId()).to.equal(null);
            expect(debugLog).to.equal([[
                "You are trying to get the ID of the selected encounter " +
                "but your app needs to be authorized first. Please don't use " +
                "open fhir servers if you need to access launch context items " +
                "like the selected encounter."
            ]]);
        });
    }); 

    describe("getEncounterId() complains about authorizeUri", () => {
        crossPlatformTest(async (env) => {
            const client = new Client(env, {
                serverUrl: mockUrl,
                authorizeUri: "whatever"
            });
            expect(client.getEncounterId()).to.equal(null);
            expect(debugLog).to.equal([[
                "You are trying to get the ID of the selected encounter " +
                "but your app is not authorized yet."
            ]]);
        });
    });

    describe("getEncounterId() complains about scopes", () => {
        crossPlatformTest(async (env) => {
            const client = new Client(env, {
                serverUrl: mockUrl,
                tokenResponse: {}
            });
            expect(client.getEncounterId()).to.equal(null);
            expect(debugLog).to.equal([[
                "You are trying to get the ID of the selected encounter " +
                "but you have not used the right scopes. Please add " +
                "'launch' or 'launch/encounter' to the scopes you " +
                "are requesting and try again."
            ]]);
        });
    });

    describe("getEncounterId() complains about server support", () => {
        crossPlatformTest(async (env) => {
            const client = new Client(env, {
                serverUrl: mockUrl,
                scope: "launch",
                tokenResponse: {}
            });
            expect(client.getEncounterId()).to.equal(null);
            expect(debugLog).to.equal([[
                "The ID of the selected encounter is not available. " +
                "Please check if your server supports that, and that " +
                "the selected patient has any recorded encounters."
            ]]);
        });
    });

    describe("getIdToken() returns null without tokenResponse", () => {
        crossPlatformTest(async (env) => {
            const client = new Client(env, mockUrl);
            expect(client.getIdToken()).to.equal(null);
            expect(debugLog).to.equal([[
                "You are trying to get the id_token but your app needs to be " +
                "authorized first. Please don't use open fhir servers if you " +
                "need to access launch context items like the id_token."
            ]]);
        });
    }); 

    describe("getIdToken() complains about authorizeUri", () => {
        crossPlatformTest(async (env) => {
            const client = new Client(env, {
                serverUrl: mockUrl,
                authorizeUri: "whatever"
            });
            expect(client.getIdToken()).to.equal(null);
            expect(debugLog).to.equal([[
                "You are trying to get the id_token " +
                "but your app is not authorized yet."
            ]]);
        });
    });

    describe("getIdToken() complains about scopes", () => {
        crossPlatformTest(async (env) => {
            const client = new Client(env, {
                serverUrl: mockUrl,
                scope: "fhirUser",
                tokenResponse: {}
            });
            expect(client.getIdToken()).to.equal(null);
            expect(debugLog).to.equal([[
                "You are trying to get the id_token but you are not " +
                "using the right scopes. Please add 'openid' and " +
                "'fhirUser' or 'profile' to the scopes you are " +
                "requesting and try again."
            ]]);
        });
    });

    describe("getIdToken() complains about server support", () => {
        crossPlatformTest(async (env) => {
            const client = new Client(env, {
                serverUrl: mockUrl,
                scope: "openid fhirUser",
                tokenResponse: {}
            });
            expect(client.getIdToken()).to.equal(null);
            expect(debugLog).to.equal([[
                "The id_token is not available. Please check if your " +
                "server supports that."
            ]]);
        });
    });

    describe("byCode", () => {
        crossPlatformTest(async (env) => {
            const client = new Client(env, "http://localhost");
            const observation1 = require("./mocks/Observation-1.json");
            const observation2 = require("./mocks/Observation-2.json");
            // const patient1     = require("./mocks/Patient-1.json");
            // const patient2     = require("./mocks/Patient-2.json");
            
            const resources = [
                observation1,
                observation2,
                // patient1,
                // patient2,
                {},
                {
                    resourceType: "Observation",
                    category: [
                        null,
                        {
                            codding: null
                        }
                    ]
                }
            ];

            expect(client.byCode(resources, "code")).to.equal({
                "55284-4": [ observation1 ],
                "6082-2" : [ observation2 ]
            });

            expect(client.byCode(resources, "category")).to.equal({
                "vital-signs": [ observation1 ],
                "laboratory" : [ observation2 ]
            });

            expect(client.byCode(resources, "missing")).to.equal({});
        });
    });

    describe("byCodes", () => {
        crossPlatformTest(async (env) => {
            const client = new Client(env, "http://localhost");
            const observation1 = require("./mocks/Observation-1.json");
            const observation2 = require("./mocks/Observation-2.json");
            
            const resources = [
                observation1,
                observation2,
                observation1,
                observation2
            ];

            expect(client.byCodes(resources, "code")("55284-4")).to.equal([observation1, observation1]);

            expect(client.byCodes(resources, "code")("6082-2")).to.equal([observation2, observation2]);

            expect(client.byCodes(resources, "category")("laboratory")).to.equal([observation2, observation2]);
        });
    });

    describe("units", () => {
        describe ("cm", () => {
            crossPlatformTest(async (env) => {
                const client = new Client(env, "http://localhost");
                expect(client.units.cm({ code: "cm", value: 3 })).to.equal(3);
                expect(client.units.cm({ code: "m", value: 3 })).to.equal(300);
                expect(client.units.cm({ code: "in", value: 3 })).to.equal(3 * 2.54);
                expect(client.units.cm({ code: "[in_us]", value: 3 })).to.equal(3 * 2.54);
                expect(client.units.cm({ code: "[in_i]", value: 3 })).to.equal(3 * 2.54);
                expect(client.units.cm({ code: "ft", value: 3 })).to.equal(3 * 30.48);
                expect(client.units.cm({ code: "[ft_us]", value: 3 })).to.equal(3 * 30.48);
                expect(() => client.units.cm({ code: "xx", value: 3 })).to.throw();
                expect(() => client.units.cm({ code: "m", value: "x" })).to.throw();
            });
        });
        describe ("kg", () => {
            crossPlatformTest(async (env) => {
                const client = new Client(env, "http://localhost");
                expect(client.units.kg({ code: "kg", value: 3 })).to.equal(3);
                expect(client.units.kg({ code: "g", value: 3 })).to.equal(3 / 1000);
                expect(client.units.kg({ code: "lb", value: 3 })).to.equal(3 / 2.20462);
                expect(client.units.kg({ code: "oz", value: 3 })).to.equal(3 / 35.274);
                expect(() => client.units.kg({ code: "xx", value: 3 })).to.throw();
                expect(() => client.units.kg({ code: "lb", value: "x" })).to.throw();
            });
        });
        describe ("any", () => {
            crossPlatformTest(async (env) => {
                const client = new Client(env, "http://localhost");
                expect(client.units.any({ value: 3 })).to.equal(3);
                expect(() => client.units.kg({ value: "x" })).to.throw();
            });
        });
    });

    describe("getPath", () => {
        it ("returns the first arg if no path", () => {
            const client = new Client({}, "http://localhost");
            const data = {};
            expect(client.getPath(data)).to.equal(data);
        });
        it ("returns the first arg for empty path", () => {
            const client = new Client({}, "http://localhost");
            const data = {};
            expect(client.getPath(data, "")).to.equal(data);
        });
        it ("works as expected", () => {
            const client = new Client({}, "http://localhost");
            const data = { a: 1, b: [0, { a: 2 }] };
            expect(client.getPath(data, "b.1.a")).to.equal(2);
            expect(client.getPath(data, "b.4.a")).to.equal(undefined);
        });
    });

    // it ("client.getBinary", async () => {
    //     const client = new window.FHIR.client(OPEN_FHIR_SERVER);
        
    //     const { data } = await client.getBinary("https://r3.smarthealthit.org/Binary/smart-4-photo")
    //         .catch(() => {
    //             throw new Error("getBinary should not throw");
    //         });
    //     expect(data).to.be.instanceof(window.Blob);

    //     // const data2 = await client.request({
    //     //     url: "https://r3.smarthealthit.org/Binary/smart-4-photo",
    //     //     dataType: "blob"
    //     // }).catch(() => {
    //     //     throw new Error("binary request should not throw");
    //     // });
    //     // expect(data2).to.be.instanceof(window.Blob);
    // });

    // it ("client.fetchBinary", async () => {
    //     const client = new window.FHIR.client(OPEN_FHIR_SERVER);
        
    //     const { data } = await client.fetchBinary("Binary/smart-4-photo")
    //         .catch(() => {
    //             throw new Error("getBinary should not throw");
    //         });
    //     expect(data).to.be.instanceof(window.Blob);
    // });
    
    // describe("client.api", () => {
    //     it ("conformance", async () => {
    //         const client = window.FHIR.client({
    //             serviceUrl: mockUrl,
    //             auth: {
    //                 type: "none"
    //             }
    //         });
    //         mockServer.mock({
    //             headers: {
    //                 "content-type": "application/json"
    //             },
    //             status: 200,
    //             body: {
    //                 conformance: true
    //             }
    //         });
    //         const data = await client.api.conformance({}).catch((e) => {
    //             console.error(e);
    //             throw new Error("client.api.conformance({}) should not throw");
    //         });
    //         expect(data).to.include({
    //             data: {
    //                 conformance: true
    //             }
    //         });
    //     });
    //     // it ("document");
    //     // it ("profile");
    //     // it ("transaction");
    //     // it ("history");
    //     // it ("typeHistory");
    //     // it ("resourceHistory");
    //     it ("read", async () => {
    //         const client = new window.FHIR.client({
    //             serviceUrl: OPEN_FHIR_SERVER,
    //             auth: {
    //                 type: "none"
    //             }
    //         });
    //         await client.api.read({
    //             type: "Patient",
    //             id: "eb3271e1-ae1b-4644-9332-41e32c829486"
    //         });
    //     });
    //     // it ("vread");
    //     // it ("delete");
    //     // it ("create");
    //     // it ("validate");
    //     // it ("search");
    //     // it ("update");
    //     // it ("nextPage");
    //     // it ("prevPage");
    //     // it ("resolve");
    //     // it ("drain");
    //     // it ("fetchAll", async () => {
    //     //     const client = new window.FHIR.client({
    //     //         serviceUrl: OPEN_FHIR_SERVER,
    //     //         auth: {
    //     //             type: "none"
    //     //         }
    //     //     });
    //     //     await client.api.fetchAll({
    //     //         type: "Patient"
    //     //     });
    //     // });
    //     // it ("fetchAllWithReferences", async () => {
    //     //     const client = new window.FHIR.client({
    //     //         serviceUrl: OPEN_FHIR_SERVER,
    //     //         auth: {
    //     //             type: "none"
    //     //         }
    //     //     });
    //     //     await client.api.fetchAllWithReferences({
    //     //         type: "Patient"
    //     //     });
    //     // });
    // });

    // // it ("user.read");
    // // it ("getBinary");
    // // it ("fetchBinary");

    // it ("handles json responses with no body", async () => {
    //     const client = new FhirClient({
    //         serviceUrl: mockUrl
    //     });

    //     mockServer.mock({
    //         headers: {
    //             "content-type": "application/json"
    //         },
    //         status: 201
    //     });

    //     const data = await client.request("Patient/5").catch(() => {
    //         throw new Error("json response with no body should not throw");
    //     });
        
    //     expect(data).to.equal(null);
           
    //     // console.log(client)
    //     //     .catch(ex => { failure = ex });

    //     // // console.log(failure)
    //     // expect(failure).to.be.an.error();
    //     // expect(failure.name).to.equal("HTTPError");
    //     // expect(failure.status).to.equal(404);
    //     // expect(failure.statusCode).to.equal(404);
    //     // expect(failure.statusText).to.equal("Not Found");
    //     // expect(failure.message).to.equal("Could not fetch Patient NoSuchId");

    //     // expect(client.get({ resource: "Patient", id: "NoSuchId" })).to.reject()
    //     // .fail(
    //     //     // function() {
    //     //     //     console.log("success", arguments);
    //     //     // },
    //     //     function() {
    //     //         console.log("error", arguments);
    //     //     }
    //     // );
    // });

});