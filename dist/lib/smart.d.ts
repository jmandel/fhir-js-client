import Client from "./Client";
import { SMART_KEY } from "./settings";
import { fhirclient } from "./types";
export { SMART_KEY as KEY };
/**
 * Fetches the well-known json file from the given base URL.
 * Note that the result is cached in memory (until the page is reloaded in the
 * browser) because it might have to be re-used by the client
 * @param baseUrl The base URL of the FHIR server
 */
export declare function fetchWellKnownJson(baseUrl?: string, requestOptions?: RequestInit): Promise<fhirclient.WellKnownSmartConfiguration>;
/**
 * Given a FHIR server, returns an object with it's Oauth security endpoints
 * that we are interested in. This will try to find the info in both the
 * `CapabilityStatement` and the `.well-known/smart-configuration`. Whatever
 * Arrives first will be used and the other request will be aborted.
 * @param [baseUrl] Fhir server base URL
 * @param [env] The Adapter
 */
export declare function getSecurityExtensions(env: fhirclient.Adapter, baseUrl?: string): Promise<fhirclient.OAuthSecurityExtensions>;
/**
 * @param env
 * @param [params]
 * @param [_noRedirect] If true, resolve with the redirect url without trying to redirect to it
 */
export declare function authorize(env: fhirclient.Adapter, params?: fhirclient.AuthorizeParams, _noRedirect?: boolean): Promise<string | void>;
/**
 * The completeAuth function should only be called on the page that represents
 * the redirectUri. We typically land there after a redirect from the
 * authorization server..
 */
export declare function completeAuth(env: fhirclient.Adapter): Promise<Client>;
/**
 * Builds the token request options. Does not make the request, just
 * creates it's configuration and returns it in a Promise.
 */
export declare function buildTokenRequest(env: fhirclient.Adapter, code: string, state: fhirclient.ClientState): RequestInit;
/**
 * @param env
 * @param [onSuccess]
 * @param [onError]
 */
export declare function ready(env: fhirclient.Adapter, onSuccess?: (client: Client) => any, onError?: (error: Error) => any): Promise<Client>;
export declare function init(env: fhirclient.Adapter, options: fhirclient.AuthorizeParams): Promise<Client | never>;
