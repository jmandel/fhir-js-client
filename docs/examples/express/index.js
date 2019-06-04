const fhir    = require("../../../src/entry");
const session = require("express-session");
const app     = require("express")();

app.use(session({
    secret: "my secret",
    resave: false,
    saveUninitialized: false
}));


// =============================================================================
// LAUNCHING
// =============================================================================
// 1. If you request http://localhost:8080/launch it will throw because the
//    FHIR service url is not known!
// 2. If an EHR calls it, it will append "launch" and "state" parameters. Try
//    it by loading http://localhost:8080/launch?iss=https://launch.smarthealthit.org/v/r2/fhir&launch=123
// 3. If you only add an "iss" url parameter (no "launch"), you are doing a
//    "dynamic" standalone launch. The app cannot obtain a launch context but
//    it is still useful to be able to do that. In addition, the SMART Sandbox
//    can be used to build a standalone launch url that contains embedded launch
//    context which may be perfect for previewing you app. For example load this
//    to launch the app with Angela Montgomery from DSTU-2:
//    http://localhost:8080/launch?iss=https://launch.smarthealthit.org/v/r2/sim/eyJrIjoiMSIsImIiOiJzbWFydC03Nzc3NzA1In0/fhir
// 4. You can add an "iss" authorize option to make this do standalone launch by
//    default. In this case http://localhost:8080/launch will not throw.
//    Note that the "iss" url parameter takes precedence over the iss option, so
//    the app will still be launch-able from an EHR
// 5. If an open server is passed as an "iss" option, or as "iss" url parameter,
//    no authorization attempt will be made and we will be redirected to the
//    redirect_uri (in this case we don't have launch context and there is no
//    selected patient so we show all patients instead). Try it:
//    http://localhost:8080/launch?iss=https://r3.smarthealthit.org
// 6. Finally, a "fhirServiceUrl" parameter can be passed as option or as url
//    parameter. It is like "iss" but will bypass the authorization (only useful
//    in testing and development). Example:
//    http://localhost:8080/launch?fhirServiceUrl=https://launch.smarthealthit.org/v/r3/fhir 
app.get("/launch", (req, res, next) => {
    fhir(req, res).authorize({
        clientId: "my-client-id",
        redirectUri: "/app",
        scope: "launch/patient patient/*.read openid fhirUser"   
    }).catch(next);
});

app.get("/app", (req, res) => {
    fhir(req, res)
        .ready()
        .then(client => client.patient.id ?
            client.patient.read() :    // Reply with the patient if we know who he is
            client.request("Patient")) // Otherwise show all patients (first page)
        .then(patient => res.json(patient))
        .catch(error => res.end(error + ""));
});

app.listen(8080);
