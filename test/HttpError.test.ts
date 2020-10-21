import { expect } from "@hapi/code";
import * as Lab   from "@hapi/lab";
import HttpError  from "../src/HttpError";

export const lab = Lab.script();
const { it, describe } = lab;

describe("HttpError", () => {
    it ("create with no args", () => {
        const error = new HttpError();
        expect(error.name).to.equal("HttpError");
        expect(error.message).to.equal("Unknown error");
        expect(error.statusCode).to.equal(0);
        expect(error.status).to.equal(0);
        expect(error.statusText).to.equal("Error");
        expect(error.body).to.equal(null);
    });

    it ("can set the message", () => {
        const error = new HttpError("Test Error");
        expect(error.name).to.equal("HttpError");
        expect(error.message).to.equal("Test Error");
        expect(error.statusCode).to.equal(0);
        expect(error.status).to.equal(0);
        expect(error.statusText).to.equal("Error");
        expect(error.body).to.equal(null);
        expect(JSON.stringify(error)).to.equal(JSON.stringify({
            name      : "HttpError",
            statusCode: 0,
            status    : 0,
            statusText: "Error",
            message   : "Test Error",
            body      : null
        }));
    });

    it ("can set the statusCode", () => {
        const error = new HttpError("Test Error", 234);
        expect(error.name).to.equal("HttpError");
        expect(error.message).to.equal("Test Error");
        expect(error.statusCode).to.equal(234);
        expect(error.status).to.equal(234);
        expect(error.statusText).to.equal("Error");
        expect(error.body).to.equal(null);
        expect(JSON.stringify(error)).to.equal(JSON.stringify({
            name      : "HttpError",
            statusCode: 234,
            status    : 234,
            statusText: "Error",
            message   : "Test Error",
            body      : null
        }));
    });

    it ("can set the statusText", () => {
        const error = new HttpError("Test Error", 234, "Test");
        expect(error.name).to.equal("HttpError");
        expect(error.message).to.equal("Test Error");
        expect(error.statusCode).to.equal(234);
        expect(error.status).to.equal(234);
        expect(error.statusText).to.equal("Test");
        expect(error.body).to.equal(null);
        expect(JSON.stringify(error)).to.equal(JSON.stringify({
            name      : "HttpError",
            statusCode: 234,
            status    : 234,
            statusText: "Test",
            message   : "Test Error",
            body      : null
        }));
    });

    it ("can set the body as text", () => {
        const error = new HttpError("Test Error", 234, "Test", "test body");
        expect(error.name).to.equal("HttpError");
        expect(error.message).to.equal("Test Error");
        expect(error.statusCode).to.equal(234);
        expect(error.status).to.equal(234);
        expect(error.statusText).to.equal("Test");
        expect(error.body).to.equal("test body");
        expect(JSON.stringify(error)).to.equal(JSON.stringify({
            name      : "HttpError",
            statusCode: 234,
            status    : 234,
            statusText: "Test",
            message   : "Test Error",
            body      : "test body"
        }));
    });

    it ("can set the body as object", () => {
        const error = new HttpError("Test Error", 234, "Test", { a: 2 });
        expect(error.name).to.equal("HttpError");
        expect(error.message).to.equal("Test Error");
        expect(error.statusCode).to.equal(234);
        expect(error.status).to.equal(234);
        expect(error.statusText).to.equal("Test");
        expect(error.body).to.equal({ a: 2 });
        expect(JSON.stringify(error)).to.equal(JSON.stringify({
            name      : "HttpError",
            statusCode: 234,
            status    : 234,
            statusText: "Test",
            message   : "Test Error",
            body      : { a: 2 }
        }));
    });
});
