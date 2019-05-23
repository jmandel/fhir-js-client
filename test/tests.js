const { expect } = require("@hapi/code");
const lab        = require("@hapi/lab").script();
const lib        = require("../src/lib");

const { it, describe, before, after } = lab;
exports.lab = lab;


describe("Lib", () => {

    describe("urlParam", () => {
        before(() => global.location = { search: "?_dummyName=_dummyValue" });
        after(() => delete global.location);

        it ("works with the global location", () => {
            expect(lib.urlParam("_dummyName")).to.equal("_dummyValue");
        });

        it ("returns null for missing params", () => {
            location.search = "";
            expect(lib.urlParam("x")).to.equal(null);
        });
        it ("returns the first occurrence for single param", () => {
            location.search = "?x=y";
            expect(lib.urlParam("x")).to.equal("y");
        });
        it ("returns the first occurrence for multiple params", () => {
            location.search = "?x=1&x=2&y=3";
            expect(lib.urlParam("x")).to.equal("1");
        });
        it ("returns and array for multi-params when forceArray = true", () => {
            location.search = "?x=1&x=2&y=3";
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

        before(() => global.location = {
            protocol: "http:",
            host: "localhost",
            pathname: "/a/b"
        });
        after(() => delete global.location);

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
});

describe("FHIR.oauth2", () => {

    describe("authorize", () => {
        it ("throws if called without params");
        it ("redirects to the proper URL");
    });

    it ("ready");
    it ("resolveAuthType");
});

describe("FHIR.client", () => {});