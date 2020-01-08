/* eslint-env browser */
/* global fhir */
import BrowserStorage from "../storage/BrowserStorage";
import BaseAdapter    from "./BaseAdapter";
import { fhirclient } from "../types";

/**
 * Browser Adapter
 */
export default class BrowserAdapter extends BaseAdapter
{
    /**
     * Stores the URL instance associated with this adapter
     */
    private _url: URL | null = null;

    /**
     * Holds the Storage instance associated with this instance
     */
    private _storage: fhirclient.Storage | null = null;

    /**
     * In browsers we need to be able to (dynamically) check if fhir.js is
     * included in the page. If it is, it should have created a "fhir" variable
     * in the global scope.
     */
    get fhir()
    {
        // @ts-ignore
        return typeof fhir === "function" ? fhir : null;
    }

    /**
     * Given the current environment, this method must return the current url
     * as URL instance
     */
    getUrl(): URL
    {
        if (!this._url) {
            this._url = new URL(location + "");
        }
        return this._url;
    }

    /**
     * Given the current environment, this method must redirect to the given
     * path
     */
    redirect(to: string): void
    {
        location.href = to;
    }

    /**
     * Returns a BrowserStorage object which is just a wrapper around
     * sessionStorage
     */
    getStorage(): BrowserStorage
    {
        if (!this._storage) {
            this._storage = new BrowserStorage();
        }
        return this._storage;
    }

    static smart(options?: fhirclient.fhirSettings): fhirclient.SMART
    {
        return new BrowserAdapter(options).getSmartApi();
    }
}
