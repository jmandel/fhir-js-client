import { fhirclient } from "./types";


export default class HttpError extends Error
{
    /**
     * The HTTP status code for this error
     */
    statusCode: number;

    /**
     * The HTTP status code for this error.
     * Note that this is the same as `status`, i.e. the code is available
     * through any of these.
     */
    status: number;

    /**
     * The HTTP status text corresponding to this error
     */
    statusText: string;

    /**
     * The parsed response body. Can be an OperationOutcome resource, a string
     * or null.
     */
    body: fhirclient.FHIR.Resource | string | null;

    constructor(
        message   : string = "Unknown error",
        statusCode: number = 0,
        statusText: string = "Error",
        body      : fhirclient.FHIR.Resource | string | null = null
    ) {
        super(message);
        this.message    = message;
        this.name       = "HttpError";
        this.statusCode = statusCode;
        this.status     = statusCode;
        this.statusText = statusText;
        this.body       = body;
    }

    toJSON() {
        return {
            name      : this.name,
            statusCode: this.statusCode,
            status    : this.status,
            statusText: this.statusText,
            message   : this.message,
            body      : this.body
        };
    }
}
