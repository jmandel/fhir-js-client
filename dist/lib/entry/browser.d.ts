import { fhirclient } from "../types";
import Client from "../Client";
declare const FHIR: {
    AbortController: {
        new (): AbortController;
        prototype: AbortController;
    };
    client: (state: string | fhirclient.ClientState) => Client;
    utils: any;
    oauth2: {
        settings: fhirclient.BrowserFHIRSettings;
        ready: (options?: fhirclient.ReadyOptions) => Promise<Client>;
        authorize: (options: fhirclient.AuthorizeParams) => Promise<string | void>;
        init: (options: fhirclient.AuthorizeParams) => Promise<Client>;
    };
};
export = FHIR;
