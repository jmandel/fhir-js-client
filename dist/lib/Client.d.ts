import { getPath, byCode, byCodes } from "./lib";
import { fhirclient } from "./types";
export default class Client {
    state: fhirclient.ClientState;
    environment: fhirclient.Adapter;
    patient: {
        id: string | null;
        read: (requestOptions?: RequestInit) => Promise<fhirclient.JsonObject>;
        request: (requestOptions: string | URL | fhirclient.RequestOptions, fhirOptions?: fhirclient.FhirOptions) => Promise<fhirclient.JsonObject>;
        api?: fhirclient.JsonObject;
    };
    encounter: {
        id: string | null;
        read: (requestOptions?: RequestInit) => Promise<fhirclient.JsonObject>;
    };
    user: {
        id: string | null;
        read: (requestOptions?: RequestInit) => Promise<fhirclient.JsonObject>;
        fhirUser: string | null;
        resourceType: string | null;
    };
    api: fhirclient.JsonObject | undefined;
    private _refreshTask;
    constructor(environment: fhirclient.Adapter, state: fhirclient.ClientState | string);
    connect(fhirJs?: (options: fhirclient.JsonObject) => fhirclient.JsonObject): Client;
    /**
     * Returns the ID of the selected patient or null. You should have requested
     * "launch/patient" scope. Otherwise this will return null.
     */
    getPatientId(): string | null;
    /**
     * Returns the ID of the selected encounter or null. You should have
     * requested "launch/encounter" scope. Otherwise this will return null.
     * Note that not all servers support the "launch/encounter" scope so this
     * will be null if they don't.
     */
    getEncounterId(): string | null;
    /**
     * Returns the (decoded) id_token if any. You need to request "openid" and
     * "profile" scopes if you need to receive an id_token (if you need to know
     * who the logged-in user is).
     */
    getIdToken(): fhirclient.IDToken | null;
    /**
     * Returns the profile of the logged_in user (if any). This is a string
     * having the following shape "{user type}/{user id}". For example:
     * "Practitioner/abc" or "Patient/xyz".
     */
    getFhirUser(): string | null;
    /**
     * Returns the user ID or null.
     */
    getUserId(): string | null;
    /**
     * Returns the type of the logged-in user or null. The result can be
     * "Practitioner", "Patient" or "RelatedPerson".
     */
    getUserType(): string | null;
    /**
     * Builds and returns the value of the `Authorization` header that can be
     * sent to the FHIR server
     */
    getAuthorizationHeader(): string | null;
    private _clearState;
    /**
     * @param resource A FHIR resource to be created
     * @param [requestOptions] Any options to be passed to the fetch call.
     * Note that `method`, `body` and `headers["Content-Type"]` will be ignored
     * but other headers can be added.
     */
    create(resource: fhirclient.FHIR.Resource, requestOptions?: RequestInit): Promise<fhirclient.FHIR.Resource>;
    /**
     * @param resource A FHIR resource to be updated
     * @param [requestOptions] Any options to be passed to the fetch call.
     * Note that `method`, `body` and `headers["Content-Type"]` will be ignored
     * but other headers can be added.
     */
    update(resource: fhirclient.FHIR.Resource, requestOptions?: RequestInit): Promise<fhirclient.FHIR.Resource>;
    /**
     * @param url Relative URI of the FHIR resource to be deleted
     * (format: `resourceType/id`)
     * @param [requestOptions] Any options (except `method` which will be fixed
     * to `DELETE`) to be passed to the fetch call.
     */
    delete(url: string, requestOptions?: RequestInit): Promise<fhirclient.FHIR.Resource>;
    /**
     * @param requestOptions Can be a string URL (relative to the serviceUrl),
     * or an object which will be passed to fetch()
     * @param fhirOptions Additional options to control the behavior
     * @param _resolvedRefs DO NOT USE! Used internally.
     */
    request<T = any>(requestOptions: string | URL | fhirclient.RequestOptions, fhirOptions?: fhirclient.FhirOptions, _resolvedRefs?: fhirclient.JsonObject): Promise<T>;
    /**
     * Use the refresh token to obtain new access token. If the refresh token is
     * expired (or this fails for any other reason) it will be deleted from the
     * state, so that we don't enter into loops trying to re-authorize.
     */
    refresh(requestOptions?: RequestInit): Promise<fhirclient.ClientState>;
    byCode: typeof byCode;
    byCodes: typeof byCodes;
    units: {
        cm({ code, value }: fhirclient.CodeValue): number;
        kg({ code, value }: fhirclient.CodeValue): number;
        any(pq: fhirclient.CodeValue): number;
    };
    getPath: typeof getPath;
    /**
     * Returns a promise that will be resolved with the fhir version as defined
     * in the CapabilityStatement.
     */
    getFhirVersion(): Promise<string>;
    /**
     * Returns a promise that will be resolved with the numeric fhir version
     * - 2 for DSTU2
     * - 3 for STU3
     * - 4 for R4
     * - 0 if the version is not known
     */
    getFhirRelease(): Promise<number>;
}
