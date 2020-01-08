"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});

class HttpError extends Error {
  constructor(message, statusCode, statusText) {
    super(message);
    this.message = message;
    this.name = "HttpError";
    this.statusCode = statusCode;
    this.status = statusCode;
    this.statusText = statusText;
  }

  toJSON() {
    return {
      name: this.name,
      statusCode: this.statusCode,
      status: this.status,
      statusText: this.statusText,
      message: this.message
    };
  }

  static create(failure) {
    // start with generic values
    let status = 0;
    let statusText = "Error";
    let message = "Unknown error";

    if (failure) {
      if (typeof failure == "object") {
        if (failure instanceof Error) {
          message = failure.message;
        } else if (failure.error) {
          status = failure.error.status || 0;
          statusText = failure.error.statusText || "Error";

          if (failure.error.responseText) {
            message = failure.error.responseText;
          }
        }
      } else if (typeof failure == "string") {
        message = failure;
      }
    }

    return new HttpError(message, status, statusText);
  }

}

exports.default = HttpError;