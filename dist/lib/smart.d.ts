import BaseAdapter from "./adapters/BaseAdapter";
import { SMART_KEY } from "./settings";
import { fhirclient } from "./types";
export { SMART_KEY as KEY };
/**
 * Fetches the conformance statement from the given base URL.
 * Note that the result is cached in memory (until the page is reloaded in the
 * browser) because it might have to be re-used by the client
 * @param baseUrl The base URL of the FHIR server
 */
export declare function fetchConformanceStatement(baseUrl?: string): Promise<fhirclient.FHIR.CapabilityStatement>;
/**
 * Fetches the well-known json file from the given base URL.
 * Note that the result is cached in memory (until the page is reloaded in the
 * browser) because it might have to be re-used by the client
 * @param baseUrl The base URL of the FHIR server
 */
export declare function fetchWellKnownJson(baseUrl?: string): Promise<fhirclient.WellKnownSmartConfiguration>;
/**
 * Fetch and return the FHIR version. This is done by fetching (and caching) the
 * CapabilityStatement of the FHIR server
 * @param [baseUrl] The base URL of the FHIR server
 */
export declare function fetchFhirVersion(baseUrl?: string): Promise<string>;
/**
 * Given a fhir server returns an object with it's Oauth security endpoints that
 * we are interested in
 * @param [baseUrl] Fhir server base URL
 */
export declare function getSecurityExtensions(baseUrl?: string): Promise<fhirclient.OAuthSecurityExtensions>;
/**
 * @param env
 * @param [params]
 * @param [_noRedirect] If true, resolve with the redirect url without trying to redirect to it
 */
export declare function authorize(env: BaseAdapter, params?: fhirclient.AuthorizeParams, _noRedirect?: boolean): Promise<string | void>;
/**
 * The completeAuth function should only be called on the page that represents
 * the redirectUri. We typically land there after a redirect from the
 * authorization server..
 */
export declare function completeAuth(env: BaseAdapter): Promise<fhirclient.Client>;
/**
 * Builds the token request options. Does not make the request, just
 * creates it's configuration and returns it in a Promise.
 */
export declare function buildTokenRequest(code: string, state: fhirclient.ClientState): RequestInit;
/**
 * @param env
 * @param [onSuccess]
 * @param [onError]
 */
export declare function ready(env: BaseAdapter, onSuccess?: () => any, onError?: () => any): Promise<fhirclient.Client>;
export declare function init(env: BaseAdapter, options: fhirclient.AuthorizeParams): Promise<fhirclient.Client | never>;
