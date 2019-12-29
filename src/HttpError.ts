interface ErrorResponse {
    error?: {
        status?: number
        statusText?: string
        responseText?: string
    }
}
export default class HttpError extends Error
{
    /**
     * The HTTP status code for this error
     */
    public statusCode: number;

    /**
     * The HTTP status code for this error.
     * Note that this is the same as `status`, i.e. the code is available
     * through any of these.
     */
    public status: number;

    /**
     * The HTTP status text corresponding to this error
     */
    public statusText: string;

    public constructor(message: string, statusCode: number, statusText: string) {
        super(message);
        this.message    = message;
        this.name       = "HttpError";
        this.statusCode = statusCode;
        this.status     = statusCode;
        this.statusText = statusText;
    }

    public toJSON() {
        return {
            name      : this.name,
            statusCode: this.statusCode,
            status    : this.status,
            statusText: this.statusText,
            message   : this.message
        };
    }

    public static create(failure?: string | Error | ErrorResponse) {
        // start with generic values
        var status: string | number     = 0;
        var statusText = "Error";
        var message    = "Unknown error";

        if (failure) {
            if (typeof failure == "object") {
                if (failure instanceof Error) {
                    message = failure.message;
                }
                else if (failure.error) {
                    status = failure.error.status || 0;
                    statusText = failure.error.statusText || "Error";
                    if (failure.error.responseText) {
                        message = failure.error.responseText;
                    }
                }
            }
            else if (typeof failure == "string") {
                message = failure;
            }
        }

        return new HttpError(message, status, statusText);
    }
}
