const { expect } = require("@hapi/code");
const lab        = require("@hapi/lab").script();
const HttpError  = require("../src/HttpError");

const { it, describe } = lab;
exports.lab = lab;


describe("HttpError", () => {
    it ("create with no args", () => {
        const error = HttpError.create();
        expect(error.name).to.equal("HttpError");
        expect(error.message).to.equal("Unknown error");
        expect(error.statusCode).to.equal(0);
        expect(error.status).to.equal(0);
        expect(error.statusText).to.equal("Error");
    });

    it ("create from string", () => {
        const error = HttpError.create("Test Error");
        expect(error.name).to.equal("HttpError");
        expect(error.message).to.equal("Test Error");
        expect(error.statusCode).to.equal(0);
        expect(error.status).to.equal(0);
        expect(error.statusText).to.equal("Error");
        expect(JSON.stringify(error)).to.equal(JSON.stringify({
            name      : "HttpError",
            statusCode: 0,
            status    : 0,
            statusText: "Error",
            message   : "Test Error"
        }));
    });

    it ("create from Error", () => {
        const error = HttpError.create(new Error("Test Error"));
        expect(error.name).to.equal("HttpError");
        expect(error.message).to.equal("Test Error");
        expect(error.statusCode).to.equal(0);
        expect(error.status).to.equal(0);
        expect(error.statusText).to.equal("Error");
    });

    it ("create from response object having error property", () => {
        const error = HttpError.create({
            error: {
                status: 404,
                statusText: "Not Found",
                responseText: "Test Error"
            }
        });
        expect(error.name).to.equal("HttpError");
        expect(error.message).to.equal("Test Error");
        expect(error.statusCode).to.equal(404);
        expect(error.status).to.equal(404);
        expect(error.statusText).to.equal("Not Found");
    });

    it ("create from incompatible object", () => {
        const error = HttpError.create({ error: "test" });
        expect(error.name).to.equal("HttpError");
        expect(error.message).to.equal("Unknown error");
        expect(error.statusCode).to.equal(0);
        expect(error.status).to.equal(0);
        expect(error.statusText).to.equal("Error");
    });

    it ("create from empty object", () => {
        const error = HttpError.create({});
        expect(error.name).to.equal("HttpError");
        expect(error.message).to.equal("Unknown error");
        expect(error.statusCode).to.equal(0);
        expect(error.status).to.equal(0);
        expect(error.statusText).to.equal("Error");
    });

    it ("create from incompatible argument", () => {
        const error = HttpError.create(true);
        expect(error.name).to.equal("HttpError");
        expect(error.message).to.equal("Unknown error");
        expect(error.statusCode).to.equal(0);
        expect(error.status).to.equal(0);
        expect(error.statusText).to.equal("Error");
    });
});