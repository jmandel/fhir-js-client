const {
    absolute,
    debug: _debug
} = require("./lib");

const patientCompartment = require("./data/patient-compartment");
const fetchConformanceStatement = require("./smart").fetchConformanceStatement;
const debug = _debug.extend("client:patient");

/**
 * Adds patient context to requestOptions object to be used with fhirclient.Client.request
 * @param {Object|String} requestOptions Can be a string URL (relative to
 *  the serviceUrl), or an object which will be passed to fetch()
 * @param {fhirclient.Client} client Current FHIR client object containing patient context
 * @return {Object|String} requestOptions object contextualied to current patient
 */
async function contextualize (requestOptions, client) {

    // This code could be useful for implementing FHIR version awareness in the future:
    //   const fhirVersionsMap = require("./data/fhir-versions");
    //   const fetchFhirVersion = require("./smart").fetchFhirVersion;
    //   const fhirVersion = client.state.fhirVersion || await fetchFhirVersion(client.state.serverUrl) || "";
    //   const fhirRelease = fhirVersionsMap[fhirVersion];

    const patient = client.patient.id;
    const base = absolute("/", client.state.serverUrl);

    if (!patient) throw new Error("Patient is not available");

    function getPatientParam(conformance, resourceType) {
        if (patientCompartment.indexOf(resourceType) == -1) throw new Error(`The "${resourceType}" resource cannot be scoped by patient`);
        const meta = conformance.rest[0].resource.find(o => o.type === resourceType);
        if (!meta) throw new Error("Resource not supported");
        if (meta.searchParam.find(x => x.name == "patient")) return "patient";
        if (meta.searchParam.find(x => x.name == "subject")) return "subject";
        // Are there any other possible search params?
        throw new Error("I don't know what param to use");
    }

    async function contextualURL(url) {
        const resourceType = url.pathname.split("/").pop();
        const params = url.searchParams;

        if (patientCompartment.indexOf(resourceType) >= 0){
            const conformance = client.state.conformanceStatement || await fetchConformanceStatement(client.state.serverUrl);
            const searchParam = getPatientParam(conformance, resourceType);
            params.set(searchParam, patient);
        }

        debug(`Contextualized request url: ${url.href}`);

        return url.href;
    }

    if (typeof requestOptions == "string" || requestOptions instanceof URL) {
        let url = new URL(requestOptions, base);
        return await contextualURL(url);
    }
    else {
        let url = new URL(requestOptions.url, base);
        requestOptions.url = await contextualURL(url);
        return requestOptions;
    }
}

module.exports = contextualize;