module.exports = {
    "dupRef"             : "Duplicated reference path \"%s\"",
    "request"            : "Request url: %s, options: %O, fhirOptions: %O",
    "clientNoServerUrl"  : "A \"serverUrl\" option is required and must begin with \"http(s)\"",
    "noCtx"              : "%s is not available",
    "noPatient"          : "Patient is not available",
    "noEncounter"        : "Encounter is not available",
    "noUser"             : "User is not available",
    "noScopeForId"       : "Trying to get the ID of the selected %s. Please add 'launch' or 'launch/%s' to the requested scopes and try again.",
    "noPatientId"        : "The ID of the selected patient is not available. Please check if your server supports that.",
    "noIdIfNoAuth"       : "You are trying to get the ID of the selected %s but the app is not authorized yet.",
    "noFreeContext"      : "Please don't use open fhir servers if you need to access launch context items like the selected %S."
};