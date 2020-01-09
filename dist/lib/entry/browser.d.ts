import { fhirclient } from "../types";
import Client from "../Client";
declare const FHIR: {
    AbortController: {
        new (): AbortController;
        prototype: AbortController;
    };
    client: (state: string | fhirclient.ClientState) => Client;
    oauth2: {
        settings: fhirclient.fhirSettings;
        ready: {
            (onSuccess: (client: Client) => any, onError?: (error: Error) => any): Promise<any>;
            (): Promise<Client>;
        };
        authorize: (options: fhirclient.AuthorizeParams) => Promise<string | void>;
        init: (options: fhirclient.AuthorizeParams) => Promise<Client>;
    };
};
export = FHIR;
