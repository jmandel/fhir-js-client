import { fhirclient } from "../types";
import { ResponseToolkit, Request } from "hapi";
declare type storageFactory = (options?: fhirclient.JsonObject) => fhirclient.Storage;
declare function smart(request: Request, h: ResponseToolkit, storage?: fhirclient.Storage | storageFactory): fhirclient.SMART;
declare namespace smart {
    var AbortController: {
        new (): AbortController;
        prototype: AbortController;
    };
}
export = smart;
