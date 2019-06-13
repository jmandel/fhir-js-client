// import { IncomingMessage } from "http";
// import Client from "./Client"
// export namespace FhirClient {
//     client: object;

/**
 * A Client instance that can be used to query the FHIR server.
 */
export interface Client {
    state: object;
    environment: object;
    api?: object;
    patient: {
        id: string;
        api?: object;
        read(): Promise<object>;
    };
    encounter: {
        id: string;
        read(): Promise<object>;
    };
    user: {
        id: string;
        fhirUser: string;
        resourceType: string;
        read(): Promise<object>;
    }
    getPatientId(): string|null;
    getEncounterId(): string|null;
    getIdToken(): object|null;
    getFhirUser(): string|null;
    getUserId(): string|null;
    getUserType(): string|null;
    getAuthorizationHeader(): string|null;
    _clearState(): Promise<void>;

    /**
     * Use this method to query the FHIR server
     * @param uri Either the full url, or a path that will be rooted at the FHIR baseUrl.
     * @param fhirOptions Additional options to control the behavior 
     * @param _resolvedRefs DO NOT USE! Used internally.
     */
    request(uri: string, fhirOptions?: FhirOptions, _resolvedRefs?: object): Promise<object>
    request(url: URL, fhirOptions?: FhirOptions, _resolvedRefs?: object): Promise<object>;
    
    /**
     * Use the refresh token to obtain new access token. If the refresh token is
     * expired (or this fails for any other reason) it will be deleted from the
     * state, so that we don't enter into loops trying to re-authorize.
     * 
     * **Note** that that `client.request()` will automatically refresh the access
     * token for you!
     * 
     * Resolves with the updated state or rejects with an error.
     */
    refresh(): Promise<object>;
    byCode(observations: object[], property: string): object[];
    byCodes(observations: object[], property: string): (codes: string[]) => object[];
    units: any;
    getPath(object: object|any[], path: string): any;
}

/**
 * Authorization parameters that can be passed to `authorize` or `init`
 */
interface AuthorizeParams {
        
    /**
     * This is the URL of the service you are connecting to.
     * For [EHR Launch](http://hl7.org/fhir/smart-app-launch/#ehr-launch-sequence)
     * you **MUST NOT** provide this option. It will be passed by the EHR as
     * url parameter instead. Using `iss` as an option will "lock" your app to
     * that service provider. In other words, passing an `iss` option is how
     * you can do [Standalone Launch](http://hl7.org/fhir/smart-app-launch/#standalone-launch-sequence).
     */
    iss?: string;
    
    /**
     * Do not pass use this option, unless you want to test it. It should come
     * as url parameter from the SMART authorization server as part of the EHR
     * launch sequence
     */
    launch?: string;

    /**
     * The base URL of the FHIR server to use. This is just like the `iss`
     * option, except that it is designed to bypass the authentication. If
     * `fhirServiceUrl` is passed, the `authorize` function will NOT actually
     * attempt to authorize. It will skip that and redirect you to your
     * `redirect_uri`.
     */
    fhirServiceUrl?: string;

    /**
     * Defaults to the current directory (it's index file)
     */
    redirectUri?: string;

    /**
     * Same as redirectUri
     */
    redirect_uri?: string;

    /**
     * The client_id that you have obtained while registering your app in the
     * EHR. This is not required if you only intend to communicate with open
     * FHIR servers. Note: For backwards compatibility reasons we also accept
     * `client_id` instead of `clientId`!
     */
    clientId?: string;

    /**
     * The client_id that you have obtained while registering your app in the
     * EHR. This is not required if you only intend to communicate with open
     * FHIR servers. Note: For backwards compatibility reasons we accept
     * `client_id` as an alias of `clientId`!
     */
    client_id?: string;

    /**
     * One or more space-separated scopes that you would like to request from
     * the EHR. [Learn more](http://hl7.org/fhir/smart-app-launch/scopes-and-launch-context/index.html)
     */
    scope?: string;

    /**
     * The ID of the selected patient. If you are launching against an open FHIR
     * server, there is no way to obtain the launch context that would include
     * the selected patient ID. This way you can "inject" that ID and make the
     * client behave as if that is the currently active patient.
     */
    patientId?: string;

    /**
     * The ID of the selected encounter. If you are launching against an open
     * FHIR server, there is no way to obtain the launch context that would
     * (in some EHRs) include the selected encounter ID. This way you can
     * "inject" that ID and make the client behave as if this is the currently
     * active encounter.
     */
    encounterId?: string;

    /**
     * If you have registered a confidential client, you should pass your
     * `clientSecret` here. **Note: ONLY use this on the server**, as the
     * browsers are considered incapable of keeping a secret.
     */
    clientSecret?: string;

    /**
     * Useful for testing. This object can contain any properties that are
     * typically contained in an [access token response](http://hl7.org/fhir/smart-app-launch/#step-3-app-exchanges-authorization-code-for-access-token).
     * These properties will be stored into the client state, as if it has been
     * authorized.
     */
    fakeTokenResponse?: object; 
}

/**
 * The SMART namespace.
 */
export namespace oauth2 {
    settings: object;
    export function ready(): Promise<Client>;
    export function authorize(p: AuthorizeParams): Promise<never>;
    export function init(p: AuthorizeParams): Promise<never|Client>;
};

export interface FhirOptions {

    /**
     * When you request a Bundle, the result will typically come back in pages
     * and you will only get the first page. You can use `pageLimit` greater
     * than `1` to request multiple pages. For example `pageLimit: 3` will fetch
     * the first 3 pages as array. To fetch all the available pages you can set
     * this to `0`.
     * - Defaults to `1`.
     * - Ignored if the response is not a `Bundle`.
     */
    pageLimit?: number;
    
    /**
     * When you fetch multiple pages the resulting array may be very large,
     * requiring a lot of time and memory. It is often better if you specify a
     * page callback instead. The `onPage` callback will be called once for each
     * page with the page Bundle as it's argument. If you use `resolveReferences`
     * and `graph: false`, the references will be passed to `onPage` as second
     * argument.
     * - If `onPage` returns a promise it will be awaited for, meaning that no
     *   more pages will be fetched until the `onPage` promise is resolved.
     * - If `onPage` returns a rejected promise or throws an error, the client
     *   will not continue fetching more pages.
     * - If you use `onPage` callback, the promise returned by `request()` will
     *   be resolved with `null`. This is to avoid building that huge array in
     *   memory. By using the `onPage` option you are stating that you will
     *   handle the result one page at a time, instead of expecting to receive
     *   the big combined result.
     */
    onPage?: () => any; 
    
    /**
     * When fetching a `Bundle`, you are typically only interested in the
     * included resources which are located at `{response}.entry[N].resource`.
     * If this option is set to `true`, the returned result will be an array of
     * resources instead of the whole bundle. This is especially useful when
     * multiple pages are fetched, because an array of page bundles is not that
     * useful and will often have to be converted to array of resources that is
     * easier to iterate.
     * - This option is ignored if the response is not a bundle.
     * - If you use `onPage` callback with `flat: true`, it will receive that
     *   array of resources instead of the page bundle.
     * - Resources from multiple pages are flattened into single array (unless
     *   you use `onPage`, which will be called with one array for each page).
     * - Defaults to `false`.
     * - Finally, `Bundle.entry` is optional in FHIR and that leads to bugs in
     *   apps that assume that it is always present. With `flat: true`, you will
     *   always get an array, even if it is empty, and even if no `entry` is
     *   found in the response bundle.
     */
    flat?: boolean;
    
    /**
     * Only applicable if you use `resolveReferences`. If `false`, the resolved
     * references will not be "mounted" in the result tree, but will be returned
     * as separate map object instead. **Defaults to `true`**.
     */
    graph?: boolean;

    /**
     * One or more references to resolve. Single item can be specified as a
     * string or as an array of one string. Multiple items must be specified as
     * array.
     * - Each item is a dot-separated path to the desired reference within the
     *   result object, excluding the "reference" property. For example
     *   `context.serviceProvider` will look for `{Response}.context.serviceProvider.reference`.
     * - If the target is an array of references (E.g.
     *   [Patient.generalPractitioner](http://hl7.org/fhir/R4/patient-definitions.html#Patient.generalPractitioner)), you can request one or more of them by index (E.g. `generalPractitioner.0`).
     *   If the index is not specified, all the references in the array will be
     *   resolved.
     * - The order in which the reference paths are specified does not matter.
     *   For example, if you use `["subject", "encounter.serviceProvider", "encounter"]`,
     *   the library should figure out that `encounter.serviceProvider` must be
     *   fetched after `encounter`. In fact, in this case it will first fetch
     *   subject and encounter in parallel, and then proceed to encounter.serviceProvider.
     * - This option does not work with contained references (they are "already
     *   resolved" anyway).
     */
    resolveReferences?: string|String[]
    
    /**
     * If the client is authorized, it will possess an access token and pass it
     * with the requests it makes. When that token expires, you should get back
     * a `401 Unauthorized` response. When that happens, if the client also has
     * a refresh token and if `useRefreshToken` is `true` (default), the client
     * will attempt to automatically re-authorize itself and then it will re-run
     * the failed request and eventually resolve it's promise with the final
     * result. This means that your requests should never fail with `401`,
     * unless the refresh token is also expired. If you don't want this, you can
     * set `useRefreshToken` to `false`. There is a `refresh` method on the
     * client that can be called manually to renew the access token.
     * - **Defaults to `true`**. 
     */
    useRefreshToken?: boolean;
}

namespace FhirClient2 {

    interface FHIR {
        client: Client;
        oauth2: {
            settings: object;
            ready: () => any;
            authorize: () => any;
            init: () => any;
        }
    }

    

    /**
     * The response object received from the token endpoint while trying to
     * exchange the auth code for an access token. This object has a well-known
     * base structure but the auth servers are free to augment it with
     * additional properties.
     * @see http://docs.smarthealthit.org/authorization/
     */
    interface TokenResponse {

        /**
         * If present, this tells the app that it is being rendered within an
         * EHR frame and the UI outside that frame already displays the selected
         * patient's name, age, gender etc. The app can decide to hide those
         * details to prevent the UI from duplicated information.
         */
        need_patient_banner?: boolean;

        /**
         * This could be a public location of some style settings that the EHR
         * would like to suggest. The app might look it up and optionally decide
         * to apply some or all of it.
         * @see https://launch.smarthealthit.org/smart-style.json
         */
        smart_style_url?: string;

        /**
         * If you have requested that require it (like `launch` or `launch/patient`)
         * the selected patient ID will be available here.
         */
        patient?: string;

        /**
         * If you have requested that require it (like `launch` or `launch/encounter`)
         * the selected encounter ID will be available here.
         * **NOTE:** This is not widely supported as of 2018. 
         */
        encounter?: string;

        /**
         * If you have requested `openid` and `profile` scopes the profile of
         * the active user will be available as `client_id`.
         * **NOTE:** Regardless of it's name, this property does not store an ID
         * but a token that also suggests the user type like `Patient/123`,
         * `Practitioner/xyz` etc.
         */
        client_id?: string;

        /**
         * Fixed value: bearer
         */
        token_type: "bearer" | "Bearer";

        /**
         * Scope of access authorized. Note that this can be different from the
         * scopes requested by the app.
         */
        scope: string,

        /**
         * Lifetime in seconds of the access token, after which the token SHALL NOT
         * be accepted by the resource server
         */
        expires_in ?: number;

        /**
         * The access token issued by the authorization server
         */
        access_token: string;

        /**
         * Authenticated patient identity and profile, if requested
         */
        id_token ?: string;

        /**
         * Token that can be used to obtain a new access token, using the same or a
         * subset of the original authorization grants
         */
        refresh_token ?: string;

        /**
         * Other properties might be passed by the server
         */
        [key: string]: any;
    }
    
    /**
     * The three security endpoints that SMART servers might declare in the
     * conformance statement
     */
    interface OAuthSecurityExtensions {

        /**
         * You could register new SMART client at this endpoint (if the server
         * supports dynamic client registration)
         */
        registrationUri: string;

        /**
         * You must call this endpoint to ask for authorization code
         */
        authorizeUri: string;

        /**
         * You must call this endpoint to exchange your authorization code
         * for an access token.
         */
        tokenUri: string;
    }

    /**
     * Describes the options that one can/should pass to the functions that
     * accept configuration argument
     */
    // interface ClientOptions extends OAuthSecurityExtensions {
    //     /**
    //      * The base URL of the Fhir server. If provided in the options, the app
    //      * will be launch-able byy simply accessing your launch URI without
    //      * requiring any parameters.
    //      */
    //     serverUrl?: string;

    //     /**
    //      * The client_id that you should have obtained while registering your
    //      * app with the auth server or EHR.
    //      */
    //     clientId: string;

    //     /**
    //      * The URI to redirect to after successful authorization. This must be
    //      * absolute path, relative to your site root, i.e. must begin with "/"
    //      */
    //     redirectUri: string;

    //     /**
    //      * The access scopes that you need.
    //      * @see http://docs.smarthealthit.org/authorization/scopes-and-launch-context/
    //      */
    //     scope?: string;

    //     /**
    //      * Your client secret if you have one (for confidential clients)
    //      */
    //     clientSecret?: string;
    // }

    // /**
    //  * Describes the state that should be passed to the Client constructor
    //  */
    // interface ClientState extends OAuthSecurityExtensions {
    //     /**
    //      * The base URL of the Fhir server. The library should have detected it
    //      * at authorization time from request query params of from config options.
    //      */
    //     serverUrl: string;

    //     /**
    //      * The client_id that you should have obtained while registering your
    //      * app with the auth server or EHR (as set in the configuration options)
    //      */
    //     clientId: string;

    //     /**
    //      * The URI to redirect to after successful authorization, as set in the
    //      * configuration options.
    //      */
    //     redirectUri: string;

    //     /**
    //      * The access scopes that you requested in your options (or an empty string).
    //      * @see http://docs.smarthealthit.org/authorization/scopes-and-launch-context/
    //      */
    //     scope: string;

    //     /**
    //      * Your client secret if you have one (for confidential clients)
    //      */
    //     clientSecret?: string;

    //     /**
    //      * The (encrypted) access token, in case you have completed the auth flow
    //      * already.
    //      */
    //     access_token?: string;

    //     /**
    //      * The response object received from the token endpoint while trying to
    //      * exchange the auth code for an access token (if you have reached that point).
    //      */
    //     tokenResponse?: TokenResponse;
    // }

    // /**
    //  * Describes the state that you should for an active session (after auth).
    //  * The difference with ClientState is that `access_token` and
    //  * `TokenResponse` **must** be present (even if they happen to be expired).
    //  */
    // interface ActiveClientState extends ClientState {
        
    //     /**
    //      * The (encrypted) access token
    //      */
    //     access_token : string;

    //     /**
    //      * The response object received from the token endpoint while trying to
    //      * exchange the auth code for an access token.
    //      */
    //     tokenResponse: TokenResponse;
    // }

    

    

    // /**
    //  * Simple key/value storage interface
    //  */
    // interface Storage {
        
    //     /**
    //      * Sets the `value` on `key` and returns a promise that will be resolved
    //      * with the value that was set.
    //      */
    //     set: (key: string, value: any) => Promise<any>;
        
    //     /**
    //      * Gets the value at `key`. Returns a promise that will be resolved
    //      * with that value (or undefined for missing keys).
    //      */
    //     get: (key: string) => Promise<any>;

    //     /**
    //      * Deletes the value at `key`. Returns a promise that will be resolved
    //      * with true if the key was deleted or with false if it was not (eg. if
    //      * did not exist).
    //      */
    //     unset: (key: string) => Promise<boolean>;
    // }

    // /**
    //  * HTTP Request object that have been augmented with a session
    //  */
    // interface HttpRequestWithSession extends IncomingMessage {
    //     session: {
    //         [key: string]: any;
    //     };
    // }

    // interface IDToken {
    //     profile: string;
    //     aud: string;
    //     sub: string;
    //     iss: string;
    //     iat: number;
    //     exp: number;
    //     [key: string]: any;
    // }

    // interface FhirBundle {
    //     link: FhirBundleNavLink[];
    //     entry?: FhirBundleEntry[];
    // }

    // interface FhirBundleNavLink {
    //     relation: string;
    //     url: string;
    // }

    // interface FhirBundleEntry {
    //     fullUrl: string; // This is optional on POSTs
    //     resource?: {
    //         [key: string]: any;
    //     }
    // }
}
