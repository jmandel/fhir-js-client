const { expect } = require("@hapi/code");
const lab        = require("@hapi/lab").script();
const lib        = require("../src/lib");
const HttpError  = require("../src/HttpError");

const { it, describe } = lab;
exports.lab = lab;


describe("Lib", () => {

    describe("setPath", () => {
        it ("works as expected", () => {
            const data = { a: 1, b: [0, { a: 2 }] };
            expect(lib.setPath(data, "b.1.a", 3)).to.equal({ a: 1, b: [0, { a: 3 }] });
            expect(lib.setPath(data, "b.2", 7)).to.equal({ a: 1, b: [0, { a: 3 }, 7] });
        });

        it ("does nothing if the first argument is null", () => {
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
            expect(lib.stripTrailingSlash(null)).to.equal("");
            expect(lib.stripTrailingSlash(false)).to.equal("");
            expect(lib.stripTrailingSlash(undefined)).to.equal("");
            expect(lib.stripTrailingSlash()).to.equal("");
            expect(lib.stripTrailingSlash(53)).to.equal("53");
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
                "400 Bad Request\nURL: undefined\n\n{}"
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
                "400 Bad Request\nURL: undefined\nmy-error"
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
                "400 Bad Request\nURL: undefined\nmy-error: my-error-description"
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
                "400 Bad Request\nURL: undefined\n\nmy-error"
            );
        });
    });

});
