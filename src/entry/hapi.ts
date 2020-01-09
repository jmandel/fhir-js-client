import HapiAdapter from "../adapters/HapiAdapter";
import { fhirclient } from "../types";
import { AbortController as Controller } from "abortcontroller-polyfill/dist/cjs-ponyfill";
import { ResponseToolkit, Request } from "hapi";

type storageFactory = (options?: fhirclient.JsonObject) => fhirclient.Storage;

function smart(
    request: Request,
    h: ResponseToolkit,
    storage?: fhirclient.Storage | storageFactory
)
{
    return new HapiAdapter({
        request,
        responseToolkit: h,
        storage
    }).getSmartApi();
}

smart.AbortController = Controller as typeof AbortController;

export = smart;
