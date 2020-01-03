import BrowserStorage from "../storage/BrowserStorage";
import BaseAdapter from "./BaseAdapter";
import { fhirclient } from "../types";
/**
 * Browser Adapter
 */
declare class BrowserAdapter extends BaseAdapter {
    /**
     * Stores the URL instance associated with this adapter
     */
    private _url;
    /**
     * Holds the Storage instance associated with this instance
     */
    private _storage;
    /**
     * In browsers we need to be able to (dynamically) check if fhir.js is
     * included in the page. If it is, it should have created a "fhir" variable
     * in the global scope.
     */
    get fhir(): any;
    /**
     * Given the current environment, this method must return the current url
     * as URL instance
     */
    getUrl(): URL;
    /**
     * Given the current environment, this method must redirect to the given
     * path
     */
    redirect(to: string): void;
    /**
     * Returns a BrowserStorage object which is just a wrapper around
     * sessionStorage
     */
    getStorage(): BrowserStorage;
    static smart(options?: fhirclient.fhirSettings): fhirclient.SMART;
}
declare const _default: typeof BrowserAdapter.smart;
export default _default;
export { BrowserAdapter as Adapter };
