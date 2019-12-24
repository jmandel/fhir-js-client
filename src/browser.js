// In Browsers we create an adapter, get the SMART api from it and build the
// global FHIR object
import smart from "./adapters/BrowserAdapter";
const { ready, authorize, init, client, options } = smart();

// $lab:coverage:off$
export { client };
export const oauth2 = {
    settings: options,
    ready,
    authorize,
    init
};
// $lab:coverage:on$
