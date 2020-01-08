
import { fhirclient } from "../types";
import Client from "../Client";

export = smart;

type storageFactory = (options?: fhirclient.JsonObject) => fhirclient.Storage;


// tslint:disable-next-line: no-namespace
declare namespace smart {
    export const oauth2: OAuth2;
    export function client(stateOrURI: fhirclient.ClientState | string): Client;
}

interface OAuth2 {
    settings: fhirclient.fhirSettings;
    ready: fhirclient.readyFunction;
    authorize: (p: fhirclient.AuthorizeParams) => Promise<never>;
    init: (p: fhirclient.AuthorizeParams) => Promise<never|Client>;
}
