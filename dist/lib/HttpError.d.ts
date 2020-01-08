interface ErrorResponse {
    error?: {
        status?: number;
        statusText?: string;
        responseText?: string;
    };
}
export default class HttpError extends Error {
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
    constructor(message: string, statusCode: number, statusText: string);
    toJSON(): {
        name: string;
        statusCode: number;
        status: number;
        statusText: string;
        message: string;
    };
    static create(failure?: string | Error | ErrorResponse): HttpError;
}
export {};
