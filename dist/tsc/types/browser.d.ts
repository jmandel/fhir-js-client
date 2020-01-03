declare const client: (state: import("./types").fhirclient.ClientState) => import("./Client").default;
export { client };
export declare const oauth2: {
    settings: import("./types").fhirclient.fhirSettings;
    ready: () => Promise<import("./Client").default>;
    authorize: (options: import("./types").fhirclient.AuthorizeParams) => Promise<string | void>;
    init: (options: import("./types").fhirclient.AuthorizeParams) => Promise<import("./Client").default>;
};
