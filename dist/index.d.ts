import "lib/types"

export namespace oauth2 {
    const settings: fhirclient.fhirSettings;
    function ready(): Promise<fhirclient.Client>;
    function authorize(p: fhirclient.AuthorizeParams): Promise<never>;
    function init(p: fhirclient.AuthorizeParams): Promise<never|fhirclient.Client>;
}

export function client(state: string|fhirclient.ClientState): fhirclient.Client;