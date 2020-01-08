import { fhirclient } from "../types";
import Client from "../Client";
import { Request, ResponseToolkit } from "hapi";

export = smart;

type storageFactory = (options?: fhirclient.JsonObject) => fhirclient.Storage;

declare function smart(
    req: Request,
    h: ResponseToolkit,
    storage?: fhirclient.Storage | storageFactory
): OAuth2;

interface OAuth2 {
    settings: fhirclient.fhirSettings;
    ready: fhirclient.readyFunction;
    authorize: (p: fhirclient.AuthorizeParams) => Promise<never>;
    init: (p: fhirclient.AuthorizeParams) => Promise<never|Client>;
}

