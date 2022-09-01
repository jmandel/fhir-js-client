import HapiAdapter from "../adapters/HapiAdapter";
import { fhirclient } from "../types";
import { AbortController } from "abortcontroller-polyfill/dist/cjs-ponyfill";
import { ResponseToolkit, Request } from "hapi";


function smart(
    request: Request,
    h: ResponseToolkit,
    storage?: fhirclient.Storage | fhirclient.storageFactory
)
{
    return new HapiAdapter({
        request,
        responseToolkit: h,
        storage
    }).getSmartApi();
}

smart.AbortController = AbortController;

export = smart;
