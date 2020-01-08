import NodeAdapter from "./NodeAdapter";
import { ClientRequest } from "http";
import { fhirclient } from "../types";

export default class HapiAdapter extends NodeAdapter
{
    /**
     * Given the current environment, this method must redirect to the given
     * path
     * @param location The path to redirect to
     */
    redirect(location: string): void
    {
        return this.options.responseToolkit.redirect(location);
    }

    /**
     * This is the static entry point and MUST be provided
     * @param request The hapi request
     * @param h The hapi response toolkit
     * @param storage Custom storage instance or a storage factory function
     */
    static smart(
        request: ClientRequest,
        h: fhirclient.JsonObject,
        storage: fhirclient.Storage | ((options?: fhirclient.JsonObject) => fhirclient.Storage)
    )
    {
        return new HapiAdapter({
            request,
            responseToolkit: h,
            storage
        }).getSmartApi();
    }
}
