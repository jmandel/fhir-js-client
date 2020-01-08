/// <reference types="node" />
import BaseAdapter from "./BaseAdapter";
import { ClientRequest, ServerResponse } from "http";
import { fhirclient } from "../types";
/**
 * Node Adapter - works with native NodeJS and with Express
 */
export default class NodeAdapter extends BaseAdapter {
    /**
     * Holds the Storage instance associated with this instance
     */
    private _storage;
    /**
     * Given the current environment, this method must return the current url
     * as URL instance. In Node we might be behind a proxy!
     */
    getUrl(): URL;
    /**
     * Given the current environment, this method must redirect to the given
     * path
     * @param location The path to redirect to
     */
    redirect(location: string): void;
    /**
     * Returns a ServerStorage instance
     */
    getStorage(): fhirclient.Storage;
    /**
     * This is the static entry point and MUST be provided
     * @param req The http request
     * @param res The http response
     * @param storage Custom storage instance or a storage
     *  factory function
     */
    static smart(req: ClientRequest, res: ServerResponse, storage?: fhirclient.Storage | ((options?: fhirclient.JsonObject) => fhirclient.Storage)): fhirclient.SMART;
}
