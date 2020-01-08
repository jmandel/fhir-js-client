import { fhirclient } from "../types";
/**
 * This is the abstract base class that adapters must inherit. It just a
 * collection of environment-specific methods that subclasses have to implement.
 */
export default abstract class BaseAdapter {
    options: fhirclient.fhirSettings;
    /**
     * @param options Environment-specific options
     */
    constructor(options?: fhirclient.fhirSettings);
    abstract getUrl(): URL;
    abstract getStorage(): fhirclient.Storage;
    abstract redirect(to: string): void | Promise<any>;
    relative(path: string): string;
    /**
     * Creates and returns adapter-aware SMART api. Not that while the shape of
     * the returned object is well known, the arguments to this function are not.
     * Those who override this method are free to require any environment-specific
     * arguments. For example in node we will need a request, a response and
     * optionally a storage or storage factory function.
     */
    getSmartApi(): fhirclient.SMART;
}
