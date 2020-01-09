import { expect }   from "@hapi/code";
import * as Lab     from "@hapi/lab";
import { Response } from "cross-fetch";
import * as lib     from "../src/lib";
import HttpError    from "../src/HttpError";
import mockServer   from "./mocks/mockServer";

export const lab = Lab.script();
const { it, describe, beforeEach, afterEach } = lab;

describe("Lib", () => {

    describe("setPath", () => {
        it ("works as expected", () => {
            const data = { a: 1, b: [0, { a: 2 }] };
            expect(lib.setPath(data, "b.1.a", 3)).to.equal({ a: 1, b: [0, { a: 3 }] });
            expect(lib.setPath(data, "b.2", 7)).to.equal({ a: 1, b: [0, { a: 3 }, 7] });
        });

        it ("does nothing if the first argument is null", () => {
            // @ts-ignore
            expect(lib.setPath(null, "b.1.a", 3)).to.equal(null);
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
            // @ts-ignore
            expect(lib.stripTrailingSlash(null)).to.equal("");
            // @ts-ignore
            expect(lib.stripTrailingSlash(false)).to.equal("");
            // @ts-ignore
            expect(lib.stripTrailingSlash(undefined)).to.equal("");
            // @ts-ignore
            expect(lib.stripTrailingSlash()).to.equal("");
            // @ts-ignore
            expect(lib.stripTrailingSlash(53)).to.equal("53");
            // @ts-ignore
            expect(lib.stripTrailingSlash(/abc/)).to.equal("/abc");
        });
    });

    describe("absolute", () => {
        it ("returns http, https or urn URI as is", () => {
            [
                "http://a/b/c",
                "https://a/b/c",
                "urn:a:b:c"
            ].forEach(uri => {
                expect(lib.absolute(uri)).to.equal(uri);
            });
        });

        // it ("if no serverUrl is provided returns URLs mounted to the current domain", () => {
        //     expect(lib.absolute("/")).to.equal(window.location.href);
        // });

        it ("returns URLs mounted to the given domain", () => {
            expect(lib.absolute("/", "http://google.com")).to.equal("http://google.com/");
            expect(lib.absolute("/a/b/c", "http://google.com")).to.equal("http://google.com/a/b/c");
            expect(lib.absolute("a/b/c", "http://google.com")).to.equal("http://google.com/a/b/c");
        });

        it ("returns site rooted paths if no baseUrl is provided", () => {
            expect(lib.absolute("/")).to.equal("/");
            expect(lib.absolute("a/b/c")).to.equal("/a/b/c");
            expect(lib.absolute("./a/b/c")).to.equal("/./a/b/c");
        });
    });

    describe("humanizeError", () => {
        it ("parses json", async () => {
            const res = new Response("{}", {
                status: 400,
                statusText: "Bad Request",
                headers: {
                    "Content-Type": "application/json"
                }
            });
            await expect(lib.humanizeError(res)).to.reject(
                HttpError,
                "400 Bad Request\nURL: \n\n{}"
            );
        });

        it ("parses json and respects 'error'", async () => {
            const res = new Response(JSON.stringify({
                error: "my-error"
            }), {
                status: 400,
                statusText: "Bad Request",
                headers: {
                    "Content-Type": "application/json"
                }
            });
            await expect(lib.humanizeError(res)).to.reject(
                HttpError,
                "400 Bad Request\nURL: \nmy-error"
            );
        });

        it ("parses json and respects 'error' and 'error_description'", async () => {
            const res = new Response(JSON.stringify({
                error: "my-error",
                error_description: "my-error-description"
            }), {
                status: 400,
                statusText: "Bad Request",
                headers: {
                    "Content-Type": "application/json"
                }
            });
            await expect(lib.humanizeError(res)).to.reject(
                HttpError,
                "400 Bad Request\nURL: \nmy-error: my-error-description"
            );
        });

        it ("parses text", async () => {
            const res = new Response("my-error", {
                status: 400,
                statusText: "Bad Request",
                headers: {
                    "Content-Type": "text/plain"
                }
            });
            await expect(lib.humanizeError(res)).to.reject(
                HttpError,
                "400 Bad Request\nURL: \n\nmy-error"
            );
        });
    });

    describe("randomString", () => {
        it ("respects strLength", () => {
            expect(lib.randomString( ).length).to.equal(8);
            expect(lib.randomString(2).length).to.equal(2);
            expect(lib.randomString(9).length).to.equal(9);
        });

        it ("respects charSet", () => {
            expect(lib.randomString(8, "abc")).to.match(/^[abc]{8}$/);
            expect(lib.randomString(8, "xyz")).to.match(/^[xyz]{8}$/);
            expect(lib.randomString(8, "123")).to.match(/^[123]{8}$/);
        });
    });

    // describe("btoa", () => {
    //     it ("works in node", () => {
    //         expect(lib.btoa("abc")).to.equal("YWJj");
    //     });

    //     it ("works in browser", () => {
    //         // @ts-ignore
    //         global.window = 1;
    //         try {
    //             expect(lib.btoa("abc")).to.equal("YWJj");
    //         } catch (ex) {
    //             throw ex;
    //         } finally {
    //             // @ts-ignore
    //             delete global.window;
    //         }
    //     });
    // });

    describe("Request Functions", () => {

        let mockDataServer: any, mockUrl: string;


        beforeEach(() => {
            return new Promise((resolve, reject) => {
                // @ts-ignore
                mockDataServer = mockServer.listen(null, "0.0.0.0", (error: Error) => {
                    if (error) {
                        return reject(error);
                    }
                    const addr: any = mockDataServer.address();
                    mockUrl = `http://127.0.0.1:${addr.port}`;
                    // console.log(`Mock Data Server listening at ${mockUrl}`);
                    resolve();
                });
            });
        });

        afterEach(() => {
            if (mockDataServer && mockDataServer.listening) {
                return new Promise(resolve => {
                    mockUrl = "";
                    mockDataServer.close((error: Error) => {
                        if (error) {
                            console.log("Error shutting down the mock-data server: ", error);
                        }
                        // console.log("Mock Data Server CLOSED!");
                        resolve();
                    });
                });
            }
        });

        describe("getAndCache", () => {
            it ("returns second hit from cache", async () => {
                mockServer.mock({
                    headers: { "content-type": "text/plain" },
                    status: 200,
                    body: "abc"
                });

                const result = await lib.getAndCache(mockUrl, {}, false);
                expect(result).to.equal("abc");

                const result2 = await lib.getAndCache(mockUrl, {}, false);
                expect(result2).to.equal("abc");
            });

            it ("can force-load and update the cache", async () => {
                mockServer.mock({
                    headers: { "content-type": "text/plain" },
                    status: 200,
                    body: "abc"
                });

                const result = await lib.getAndCache(mockUrl, {}, false);
                expect(result).to.equal("abc");

                mockServer.mock({
                    headers: { "content-type": "text/plain" },
                    status: 200,
                    body: "123"
                });

                const result2 = await lib.getAndCache(mockUrl, {}, false);
                expect(result2).to.equal("abc");

                const result3 = await lib.getAndCache(mockUrl, {}, true);
                expect(result3).to.equal("123");
            });
        });

        describe("fetchConformanceStatement", () => {

            it ("rejects bad baseUrl values", async () => {
                await expect(lib.fetchConformanceStatement("")).to.reject();
                // @ts-ignore
                await expect(lib.fetchConformanceStatement(null)).to.reject();
                await expect(lib.fetchConformanceStatement("whatever")).to.reject();
            });

            it("works", async () => {
                mockServer.mock({
                    headers: { "content-type": "application/json" },
                    status: 200,
                    body: {
                        resourceType: "Conformance"
                    }
                });
                const conformance = await lib.fetchConformanceStatement(mockUrl);
                // @ts-ignore
                expect(conformance).to.equal({resourceType: "Conformance"});
            });

            it("rejects on error", async () => {
                mockServer.mock({
                    status: 404,
                    body: "Not Found"
                });
                await expect(lib.fetchConformanceStatement(mockUrl)).to.reject(Error, /Not Found/);
            });
        });
    });
});
