const { expect } = require("@hapi/code");
const lab        = require("@hapi/lab").script();
const lib        = require("../src/lib");

const { it, describe } = lab;
exports.lab = lab;


describe("Lib", () => {

    describe("getPath", () => {
        it ("returns the first arg if no path", () => {
            const data = {};
            expect(lib.getPath(data)).to.equal(data);
        });
        it ("returns the first arg for empty path", () => {
            const data = {};
            expect(lib.getPath(data, "")).to.equal(data);
        });
        it ("works as expected", () => {
            const data = { a: 1, b: [0, { a: 2 }] };
            expect(lib.getPath(data, "b.1.a")).to.equal(2);
            expect(lib.getPath(data, "b.4.a")).to.equal(undefined);
        });
    });

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

    describe("byCode", () => {
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

        expect(lib.byCode(resources, "code")).to.equal({
            "55284-4": [ observation1 ],
            "6082-2" : [ observation2 ]
        });

        expect(lib.byCode(resources, "category")).to.equal({
            "vital-signs": [ observation1 ],
            "laboratory" : [ observation2 ]
        });

        expect(lib.byCode(resources, "missing")).to.equal({});

        // expect(lib.byCode(resources, "maritalStatus")).to.equal({
        //     S: [ patient1, patient2 ]
        // });

        // expect(lib.byCode(resources, "communication.language")).to.equal({
        //     // S: [ patient1, patient2 ]
        // });
    });

    describe("byCodes", () => {
        const observation1 = require("./mocks/Observation-1.json");
        const observation2 = require("./mocks/Observation-2.json");
        
        const resources = [
            observation1,
            observation2,
            observation1,
            observation2
        ];

        expect(lib.byCodes(resources, "code")("55284-4")).to.equal([observation1, observation1]);

        expect(lib.byCodes(resources, "code")("6082-2")).to.equal([observation2, observation2]);

        expect(lib.byCodes(resources, "category")("laboratory")).to.equal([observation2, observation2]);
    });

    describe("units", () => {
        it ("cm", () => {
            expect(lib.units.cm({ code: "cm", value: 3 })).to.equal(3);
            expect(lib.units.cm({ code: "m", value: 3 })).to.equal(300);
            expect(lib.units.cm({ code: "in", value: 3 })).to.equal(3 * 2.54);
            expect(lib.units.cm({ code: "[in_us]", value: 3 })).to.equal(3 * 2.54);
            expect(lib.units.cm({ code: "[in_i]", value: 3 })).to.equal(3 * 2.54);
            expect(lib.units.cm({ code: "ft", value: 3 })).to.equal(3 * 30.48);
            expect(lib.units.cm({ code: "[ft_us]", value: 3 })).to.equal(3 * 30.48);
            expect(() => lib.units.cm({ code: "xx", value: 3 })).to.throw();
            expect(() => lib.units.cm({ code: "m", value: "x" })).to.throw();
        });
        it ("kg", () => {
            expect(lib.units.kg({ code: "kg", value: 3 })).to.equal(3);
            expect(lib.units.kg({ code: "g", value: 3 })).to.equal(3 / 1000);
            expect(lib.units.kg({ code: "lb", value: 3 })).to.equal(3 / 2.20462);
            expect(lib.units.kg({ code: "oz", value: 3 })).to.equal(3 / 35.274);
            expect(() => lib.units.kg({ code: "xx", value: 3 })).to.throw();
            expect(() => lib.units.kg({ code: "lb", value: "x" })).to.throw();
        });
        it ("any", () => {
            expect(lib.units.any({ value: 3 })).to.equal(3);
            expect(() => lib.units.kg({ value: "x" })).to.throw();
        });
    }); 
});
