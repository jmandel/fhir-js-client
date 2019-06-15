const { URL }    = require("url");
const { expect } = require("@hapi/code");
const lab        = require("@hapi/lab").script();
const smart      = require("../src/smart");

// mocks
const BrowserEnv = require("./mocks/BrowserEnvironment");
const Window     = require("./mocks/Window");
const mockServer = require("./mocks/mockServer");


const {
    it,
    describe,
    before,
    after,
    beforeEach,
    afterEach
} = lab;
exports.lab = lab;

let mockDataServer, mockUrl;


before(() => {
    return new Promise((resolve, reject) => {
        mockDataServer = mockServer.listen(null, "0.0.0.0", error => {
            if (error) {
                return reject(error);
            }
            let addr = mockDataServer.address();
            mockUrl = `http://127.0.0.1:${addr.port}`;
            // console.log(`Mock Data Server listening at ${mockUrl}`);
            resolve();
        });
    });
});

after(() => {
    if (mockDataServer && mockDataServer.listening) {
        return new Promise(resolve => {
            mockUrl = "";
            mockDataServer.close(error => {
                if (error) {
                    console.log("Error shutting down the mock-data server: ", error);
                }
                // console.log("Mock Data Server CLOSED!");
                resolve();
            });
        });
    }
});

beforeEach(() => {
    global.window = new Window();
});

afterEach(() => {
    mockServer.clear();
    delete global.window;
    // window.FHIR.oauth2.settings.fullSessionStorageSupport = true;
    // window.FHIR.oauth2.settings.replaceBrowserHistory = true;
});

// -----------------------------------------------------------------------------

describe ("Complete authorization", () => {
    it ("code flow", async () => {

        const env = new BrowserEnv();
        const Storage = env.getStorage();

        // mock our oauth endpoints
        mockServer.mock({
            headers: { "content-type": "application/json" },
            status: 200,
            body: {
                authorization_endpoint: mockUrl,
                token_endpoint: mockUrl
            }
        });

        // Call our launch code.
        await smart.authorize(env, {
            iss: mockUrl,
            launch: "123",
            scope: "my_scope",
            client_id: "my_client_id"
        });

        // Now we have been redirected to `redirect` and then back to our
        // redirect_uri. It is time to complete the authorization.
        const redirect = env.getUrl();

        // Get the state parameter from the URL
        const state = redirect.searchParams.get("state");

        expect(await Storage.get(state), "must have set a state at " + state).to.exist();

        // mock our access token response
        mockServer.mock({
            headers: { "content-type": "application/json" },
            status: 200,
            body: {
                "need_patient_banner": true,
                "smart_style_url": "https://launch.smarthealthit.org/smart-style.json",
                "patient": "b2536dd3-bccd-4d22-8355-ab20acdf240b",
                "encounter": "e3ec2d15-4c27-4607-a45c-2f84962b0700",
                "refresh_token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJjb250ZXh0Ijp7Im5lZWRfcGF0aWVudF9iYW5uZXIiOnRydWUsInNtYXJ0X3N0eWxlX3VybCI6Imh0dHBzOi8vbGF1bmNoLnNtYXJ0aGVhbHRoaXQub3JnL3NtYXJ0LXN0eWxlLmpzb24iLCJwYXRpZW50IjoiYjI1MzZkZDMtYmNjZC00ZDIyLTgzNTUtYWIyMGFjZGYyNDBiIiwiZW5jb3VudGVyIjoiZTNlYzJkMTUtNGMyNy00NjA3LWE0NWMtMmY4NDk2MmIwNzAwIn0sImNsaWVudF9pZCI6Im15X3dlYl9hcHAiLCJzY29wZSI6Im9wZW5pZCBmaGlyVXNlciBvZmZsaW5lX2FjY2VzcyB1c2VyLyouKiBwYXRpZW50LyouKiBsYXVuY2gvZW5jb3VudGVyIGxhdW5jaC9wYXRpZW50IHByb2ZpbGUiLCJ1c2VyIjoiUHJhY3RpdGlvbmVyL3NtYXJ0LVByYWN0aXRpb25lci03MTQ4MjcxMyIsImlhdCI6MTU1OTEzODkxMywiZXhwIjoxNTkwNjc0OTE0fQ.-Ey7wdFSlmfoQrm7HNxAgJQBJPKdtfH7kL1Z91L60_8",
                "token_type": "bearer",
                "scope": "openid fhirUser offline_access user/*.* patient/*.* launch/encounter launch/patient profile",
                "client_id": "my_web_app",
                "expires_in": 3600,
                "id_token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJwcm9maWxlIjoiUHJhY3RpdGlvbmVyL3NtYXJ0LVByYWN0aXRpb25lci03MTQ4MjcxMyIsImZoaXJVc2VyIjoiUHJhY3RpdGlvbmVyL3NtYXJ0LVByYWN0aXRpb25lci03MTQ4MjcxMyIsImF1ZCI6Im15X3dlYl9hcHAiLCJzdWIiOiJkYjIzZDBkZTI1Njc4ZTY3MDk5YmM0MzQzMjNkYzBkOTY1MTNiNTUyMmQ0Yjc0MWNiYTM5ZjdjOTJkMGM0NmFlIiwiaXNzIjoiaHR0cDovL2xhdW5jaC5zbWFydGhlYWx0aGl0Lm9yZyIsImlhdCI6MTU1OTEzODkxNCwiZXhwIjoxNTU5MTQyNTE0fQ.OtbIcs5nyEKaD2kAPasm1DYFixHvVbkC1wQys3oa3T-4Tf8wxW56hzUK0ZQeOK_gEIxiSFn9tLoUvKau_M1WRVD11FPyulvs1Q8EbG5PQ83MBudcpZQJ_uuFbVcGsDMy2xEa_8jAHkHPAVNjj8FRsQCRZC0Hfg0NbXli3yOhAFK1LqTUcrnjfwD-sak0UGQS1H6OgILnTYLrlTTIonfnWRdpWJjjIh3_GCk5k-8LU8AARaPcSE3ZhezoKTSfwQn1XO101g5h337pZleaIlFlhxPRFSKtpXz7BEezkUi5CJqN4d2qNoBK9kapljFYEVdPjRqaBnt4blmyFRXjhdMNwA",
                "access_token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJuZWVkX3BhdGllbnRfYmFubmVyIjp0cnVlLCJzbWFydF9zdHlsZV91cmwiOiJodHRwczovL2xhdW5jaC5zbWFydGhlYWx0aGl0Lm9yZy9zbWFydC1zdHlsZS5qc29uIiwicGF0aWVudCI6ImIyNTM2ZGQzLWJjY2QtNGQyMi04MzU1LWFiMjBhY2RmMjQwYiIsImVuY291bnRlciI6ImUzZWMyZDE1LTRjMjctNDYwNy1hNDVjLTJmODQ5NjJiMDcwMCIsInJlZnJlc2hfdG9rZW4iOiJleUowZVhBaU9pSktWMVFpTENKaGJHY2lPaUpJVXpJMU5pSjkuZXlKamIyNTBaWGgwSWpwN0ltNWxaV1JmY0dGMGFXVnVkRjlpWVc1dVpYSWlPblJ5ZFdVc0luTnRZWEowWDNOMGVXeGxYM1Z5YkNJNkltaDBkSEJ6T2k4dmJHRjFibU5vTG5OdFlYSjBhR1ZoYkhSb2FYUXViM0puTDNOdFlYSjBMWE4wZVd4bExtcHpiMjRpTENKd1lYUnBaVzUwSWpvaVlqSTFNelprWkRNdFltTmpaQzAwWkRJeUxUZ3pOVFV0WVdJeU1HRmpaR1l5TkRCaUlpd2laVzVqYjNWdWRHVnlJam9pWlRObFl6SmtNVFV0TkdNeU55MDBOakEzTFdFME5XTXRNbVk0TkRrMk1tSXdOekF3SW4wc0ltTnNhV1Z1ZEY5cFpDSTZJbTE1WDNkbFlsOWhjSEFpTENKelkyOXdaU0k2SW05d1pXNXBaQ0JtYUdseVZYTmxjaUJ2Wm1ac2FXNWxYMkZqWTJWemN5QjFjMlZ5THlvdUtpQndZWFJwWlc1MEx5b3VLaUJzWVhWdVkyZ3ZaVzVqYjNWdWRHVnlJR3hoZFc1amFDOXdZWFJwWlc1MElIQnliMlpwYkdVaUxDSjFjMlZ5SWpvaVVISmhZM1JwZEdsdmJtVnlMM050WVhKMExWQnlZV04wYVhScGIyNWxjaTAzTVRRNE1qY3hNeUlzSW1saGRDSTZNVFUxT1RFek9Ea3hNeXdpWlhod0lqb3hOVGt3TmpjME9URTBmUS4tRXk3d2RGU2xtZm9Rcm03SE54QWdKUUJKUEtkdGZIN2tMMVo5MUw2MF84IiwidG9rZW5fdHlwZSI6ImJlYXJlciIsInNjb3BlIjoib3BlbmlkIGZoaXJVc2VyIG9mZmxpbmVfYWNjZXNzIHVzZXIvKi4qIHBhdGllbnQvKi4qIGxhdW5jaC9lbmNvdW50ZXIgbGF1bmNoL3BhdGllbnQgcHJvZmlsZSIsImNsaWVudF9pZCI6Im15X3dlYl9hcHAiLCJleHBpcmVzX2luIjozNjAwLCJpZF90b2tlbiI6ImV5SjBlWEFpT2lKS1YxUWlMQ0poYkdjaU9pSlNVekkxTmlKOS5leUp3Y205bWFXeGxJam9pVUhKaFkzUnBkR2x2Ym1WeUwzTnRZWEowTFZCeVlXTjBhWFJwYjI1bGNpMDNNVFE0TWpjeE15SXNJbVpvYVhKVmMyVnlJam9pVUhKaFkzUnBkR2x2Ym1WeUwzTnRZWEowTFZCeVlXTjBhWFJwYjI1bGNpMDNNVFE0TWpjeE15SXNJbUYxWkNJNkltMTVYM2RsWWw5aGNIQWlMQ0p6ZFdJaU9pSmtZakl6WkRCa1pUSTFOamM0WlRZM01EazVZbU0wTXpRek1qTmtZekJrT1RZMU1UTmlOVFV5TW1RMFlqYzBNV05pWVRNNVpqZGpPVEprTUdNME5tRmxJaXdpYVhOeklqb2lhSFIwY0RvdkwyeGhkVzVqYUM1emJXRnlkR2hsWVd4MGFHbDBMbTl5WnlJc0ltbGhkQ0k2TVRVMU9URXpPRGt4TkN3aVpYaHdJam94TlRVNU1UUXlOVEUwZlEuT3RiSWNzNW55RUthRDJrQVBhc20xRFlGaXhIdlZia0Mxd1F5czNvYTNULTRUZjh3eFc1Nmh6VUswWlFlT0tfZ0VJeGlTRm45dExvVXZLYXVfTTFXUlZEMTFGUHl1bHZzMVE4RWJHNVBRODNNQnVkY3BaUUpfdXVGYlZjR3NETXkyeEVhXzhqQUhrSFBBVk5qajhGUnNRQ1JaQzBIZmcwTmJYbGkzeU9oQUZLMUxxVFVjcm5qZndELXNhazBVR1FTMUg2T2dJTG5UWUxybFRUSW9uZm5XUmRwV0pqakloM19HQ2s1ay04TFU4QUFSYVBjU0UzWmhlem9LVFNmd1FuMVhPMTAxZzVoMzM3cFpsZWFJbEZsaHhQUkZTS3RwWHo3QkVlemtVaTVDSnFONGQycU5vQks5a2FwbGpGWUVWZFBqUnFhQm50NGJsbXlGUlhqaGRNTndBIiwiaWF0IjoxNTU5MTM4OTE0LCJleHAiOjE1NTkxNDI1MTR9.lhfmhXYfoaI4QcJYvFnr2FMn_RHO8aXSzzkXzwNpc7w",
                "code": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJjb250ZXh0Ijp7Im5lZWRfcGF0aWVudF9iYW5uZXIiOnRydWUsInNtYXJ0X3N0eWxlX3VybCI6Imh0dHBzOi8vbGF1bmNoLnNtYXJ0aGVhbHRoaXQub3JnL3NtYXJ0LXN0eWxlLmpzb24iLCJwYXRpZW50IjoiYjI1MzZkZDMtYmNjZC00ZDIyLTgzNTUtYWIyMGFjZGYyNDBiIiwiZW5jb3VudGVyIjoiZTNlYzJkMTUtNGMyNy00NjA3LWE0NWMtMmY4NDk2MmIwNzAwIn0sImNsaWVudF9pZCI6Im15X3dlYl9hcHAiLCJzY29wZSI6Im9wZW5pZCBmaGlyVXNlciBvZmZsaW5lX2FjY2VzcyB1c2VyLyouKiBwYXRpZW50LyouKiBsYXVuY2gvZW5jb3VudGVyIGxhdW5jaC9wYXRpZW50IHByb2ZpbGUiLCJ1c2VyIjoiUHJhY3RpdGlvbmVyL3NtYXJ0LVByYWN0aXRpb25lci03MTQ4MjcxMyIsImlhdCI6MTU1OTEzODkxMywiZXhwIjoxNTU5MTM5MjEzfQ.G2dLcSnjpwM_joWTxWLfL48vhdlj3zGV9Os5cKREYcY",
                state
            }
        });

        env.redirect("http://localhost/?code=123&state=" + state);
        const client = await smart.completeAuth(env);

        // make sure tha browser history was replaced
        expect(window.history._location).to.equal("http://localhost/");

        expect(await Storage.get(smart.KEY), `must have set a state at ${smart.KEY}`).to.exist();
        expect(client.getPatientId()).to.equal("b2536dd3-bccd-4d22-8355-ab20acdf240b");
        expect(client.getEncounterId()).to.equal("e3ec2d15-4c27-4607-a45c-2f84962b0700");
        expect(client.getUserId()).to.equal("smart-Practitioner-71482713");
        expect(client.getUserType()).to.equal("Practitioner");
    });

    it ("code flow with fullSessionStorageSupport = false", async () => {

        const env = new BrowserEnv({
            fullSessionStorageSupport: false,
            replaceBrowserHistory: false
        });
        const Storage = env.getStorage();

        // mock our oauth endpoints
        mockServer.mock({
            headers: { "content-type": "application/json" },
            status: 200,
            body: {
                authorization_endpoint: mockUrl,
                token_endpoint: mockUrl
            }
        });

        // Call our launch code.
        await smart.authorize(env, {
            iss: mockUrl,
            launch: "123",
            scope: "my_scope",
            client_id: "my_client_id"
        });

        // Now we have been redirected to `redirect` and then back to our
        // redirect_uri. It is time to complete the authorization.
        const redirect = env.getUrl();

        // Get the state parameter from the URL
        const key = redirect.searchParams.get("state"); // console.log(redirect);

        // console.log(redirect, state, storage.get(state));
        expect(await Storage.get(key), "must have set a state at " + key).to.exist();

        // mock our access token response
        mockServer.mock({
            headers: { "content-type": "application/json" },
            status: 200,
            body: {
                "need_patient_banner": true,
                "smart_style_url": "https://launch.smarthealthit.org/smart-style.json",
                "patient": "b2536dd3-bccd-4d22-8355-ab20acdf240b",
                "encounter": "e3ec2d15-4c27-4607-a45c-2f84962b0700",
                "refresh_token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJjb250ZXh0Ijp7Im5lZWRfcGF0aWVudF9iYW5uZXIiOnRydWUsInNtYXJ0X3N0eWxlX3VybCI6Imh0dHBzOi8vbGF1bmNoLnNtYXJ0aGVhbHRoaXQub3JnL3NtYXJ0LXN0eWxlLmpzb24iLCJwYXRpZW50IjoiYjI1MzZkZDMtYmNjZC00ZDIyLTgzNTUtYWIyMGFjZGYyNDBiIiwiZW5jb3VudGVyIjoiZTNlYzJkMTUtNGMyNy00NjA3LWE0NWMtMmY4NDk2MmIwNzAwIn0sImNsaWVudF9pZCI6Im15X3dlYl9hcHAiLCJzY29wZSI6Im9wZW5pZCBmaGlyVXNlciBvZmZsaW5lX2FjY2VzcyB1c2VyLyouKiBwYXRpZW50LyouKiBsYXVuY2gvZW5jb3VudGVyIGxhdW5jaC9wYXRpZW50IHByb2ZpbGUiLCJ1c2VyIjoiUHJhY3RpdGlvbmVyL3NtYXJ0LVByYWN0aXRpb25lci03MTQ4MjcxMyIsImlhdCI6MTU1OTEzODkxMywiZXhwIjoxNTkwNjc0OTE0fQ.-Ey7wdFSlmfoQrm7HNxAgJQBJPKdtfH7kL1Z91L60_8",
                "token_type": "bearer",
                "scope": "openid fhirUser offline_access user/*.* patient/*.* launch/encounter launch/patient profile",
                "client_id": "my_web_app",
                "expires_in": 3600,
                "id_token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJwcm9maWxlIjoiUHJhY3RpdGlvbmVyL3NtYXJ0LVByYWN0aXRpb25lci03MTQ4MjcxMyIsImZoaXJVc2VyIjoiUHJhY3RpdGlvbmVyL3NtYXJ0LVByYWN0aXRpb25lci03MTQ4MjcxMyIsImF1ZCI6Im15X3dlYl9hcHAiLCJzdWIiOiJkYjIzZDBkZTI1Njc4ZTY3MDk5YmM0MzQzMjNkYzBkOTY1MTNiNTUyMmQ0Yjc0MWNiYTM5ZjdjOTJkMGM0NmFlIiwiaXNzIjoiaHR0cDovL2xhdW5jaC5zbWFydGhlYWx0aGl0Lm9yZyIsImlhdCI6MTU1OTEzODkxNCwiZXhwIjoxNTU5MTQyNTE0fQ.OtbIcs5nyEKaD2kAPasm1DYFixHvVbkC1wQys3oa3T-4Tf8wxW56hzUK0ZQeOK_gEIxiSFn9tLoUvKau_M1WRVD11FPyulvs1Q8EbG5PQ83MBudcpZQJ_uuFbVcGsDMy2xEa_8jAHkHPAVNjj8FRsQCRZC0Hfg0NbXli3yOhAFK1LqTUcrnjfwD-sak0UGQS1H6OgILnTYLrlTTIonfnWRdpWJjjIh3_GCk5k-8LU8AARaPcSE3ZhezoKTSfwQn1XO101g5h337pZleaIlFlhxPRFSKtpXz7BEezkUi5CJqN4d2qNoBK9kapljFYEVdPjRqaBnt4blmyFRXjhdMNwA",
                "access_token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJuZWVkX3BhdGllbnRfYmFubmVyIjp0cnVlLCJzbWFydF9zdHlsZV91cmwiOiJodHRwczovL2xhdW5jaC5zbWFydGhlYWx0aGl0Lm9yZy9zbWFydC1zdHlsZS5qc29uIiwicGF0aWVudCI6ImIyNTM2ZGQzLWJjY2QtNGQyMi04MzU1LWFiMjBhY2RmMjQwYiIsImVuY291bnRlciI6ImUzZWMyZDE1LTRjMjctNDYwNy1hNDVjLTJmODQ5NjJiMDcwMCIsInJlZnJlc2hfdG9rZW4iOiJleUowZVhBaU9pSktWMVFpTENKaGJHY2lPaUpJVXpJMU5pSjkuZXlKamIyNTBaWGgwSWpwN0ltNWxaV1JmY0dGMGFXVnVkRjlpWVc1dVpYSWlPblJ5ZFdVc0luTnRZWEowWDNOMGVXeGxYM1Z5YkNJNkltaDBkSEJ6T2k4dmJHRjFibU5vTG5OdFlYSjBhR1ZoYkhSb2FYUXViM0puTDNOdFlYSjBMWE4wZVd4bExtcHpiMjRpTENKd1lYUnBaVzUwSWpvaVlqSTFNelprWkRNdFltTmpaQzAwWkRJeUxUZ3pOVFV0WVdJeU1HRmpaR1l5TkRCaUlpd2laVzVqYjNWdWRHVnlJam9pWlRObFl6SmtNVFV0TkdNeU55MDBOakEzTFdFME5XTXRNbVk0TkRrMk1tSXdOekF3SW4wc0ltTnNhV1Z1ZEY5cFpDSTZJbTE1WDNkbFlsOWhjSEFpTENKelkyOXdaU0k2SW05d1pXNXBaQ0JtYUdseVZYTmxjaUJ2Wm1ac2FXNWxYMkZqWTJWemN5QjFjMlZ5THlvdUtpQndZWFJwWlc1MEx5b3VLaUJzWVhWdVkyZ3ZaVzVqYjNWdWRHVnlJR3hoZFc1amFDOXdZWFJwWlc1MElIQnliMlpwYkdVaUxDSjFjMlZ5SWpvaVVISmhZM1JwZEdsdmJtVnlMM050WVhKMExWQnlZV04wYVhScGIyNWxjaTAzTVRRNE1qY3hNeUlzSW1saGRDSTZNVFUxT1RFek9Ea3hNeXdpWlhod0lqb3hOVGt3TmpjME9URTBmUS4tRXk3d2RGU2xtZm9Rcm03SE54QWdKUUJKUEtkdGZIN2tMMVo5MUw2MF84IiwidG9rZW5fdHlwZSI6ImJlYXJlciIsInNjb3BlIjoib3BlbmlkIGZoaXJVc2VyIG9mZmxpbmVfYWNjZXNzIHVzZXIvKi4qIHBhdGllbnQvKi4qIGxhdW5jaC9lbmNvdW50ZXIgbGF1bmNoL3BhdGllbnQgcHJvZmlsZSIsImNsaWVudF9pZCI6Im15X3dlYl9hcHAiLCJleHBpcmVzX2luIjozNjAwLCJpZF90b2tlbiI6ImV5SjBlWEFpT2lKS1YxUWlMQ0poYkdjaU9pSlNVekkxTmlKOS5leUp3Y205bWFXeGxJam9pVUhKaFkzUnBkR2x2Ym1WeUwzTnRZWEowTFZCeVlXTjBhWFJwYjI1bGNpMDNNVFE0TWpjeE15SXNJbVpvYVhKVmMyVnlJam9pVUhKaFkzUnBkR2x2Ym1WeUwzTnRZWEowTFZCeVlXTjBhWFJwYjI1bGNpMDNNVFE0TWpjeE15SXNJbUYxWkNJNkltMTVYM2RsWWw5aGNIQWlMQ0p6ZFdJaU9pSmtZakl6WkRCa1pUSTFOamM0WlRZM01EazVZbU0wTXpRek1qTmtZekJrT1RZMU1UTmlOVFV5TW1RMFlqYzBNV05pWVRNNVpqZGpPVEprTUdNME5tRmxJaXdpYVhOeklqb2lhSFIwY0RvdkwyeGhkVzVqYUM1emJXRnlkR2hsWVd4MGFHbDBMbTl5WnlJc0ltbGhkQ0k2TVRVMU9URXpPRGt4TkN3aVpYaHdJam94TlRVNU1UUXlOVEUwZlEuT3RiSWNzNW55RUthRDJrQVBhc20xRFlGaXhIdlZia0Mxd1F5czNvYTNULTRUZjh3eFc1Nmh6VUswWlFlT0tfZ0VJeGlTRm45dExvVXZLYXVfTTFXUlZEMTFGUHl1bHZzMVE4RWJHNVBRODNNQnVkY3BaUUpfdXVGYlZjR3NETXkyeEVhXzhqQUhrSFBBVk5qajhGUnNRQ1JaQzBIZmcwTmJYbGkzeU9oQUZLMUxxVFVjcm5qZndELXNhazBVR1FTMUg2T2dJTG5UWUxybFRUSW9uZm5XUmRwV0pqakloM19HQ2s1ay04TFU4QUFSYVBjU0UzWmhlem9LVFNmd1FuMVhPMTAxZzVoMzM3cFpsZWFJbEZsaHhQUkZTS3RwWHo3QkVlemtVaTVDSnFONGQycU5vQks5a2FwbGpGWUVWZFBqUnFhQm50NGJsbXlGUlhqaGRNTndBIiwiaWF0IjoxNTU5MTM4OTE0LCJleHAiOjE1NTkxNDI1MTR9.lhfmhXYfoaI4QcJYvFnr2FMn_RHO8aXSzzkXzwNpc7w",
                "code": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJjb250ZXh0Ijp7Im5lZWRfcGF0aWVudF9iYW5uZXIiOnRydWUsInNtYXJ0X3N0eWxlX3VybCI6Imh0dHBzOi8vbGF1bmNoLnNtYXJ0aGVhbHRoaXQub3JnL3NtYXJ0LXN0eWxlLmpzb24iLCJwYXRpZW50IjoiYjI1MzZkZDMtYmNjZC00ZDIyLTgzNTUtYWIyMGFjZGYyNDBiIiwiZW5jb3VudGVyIjoiZTNlYzJkMTUtNGMyNy00NjA3LWE0NWMtMmY4NDk2MmIwNzAwIn0sImNsaWVudF9pZCI6Im15X3dlYl9hcHAiLCJzY29wZSI6Im9wZW5pZCBmaGlyVXNlciBvZmZsaW5lX2FjY2VzcyB1c2VyLyouKiBwYXRpZW50LyouKiBsYXVuY2gvZW5jb3VudGVyIGxhdW5jaC9wYXRpZW50IHByb2ZpbGUiLCJ1c2VyIjoiUHJhY3RpdGlvbmVyL3NtYXJ0LVByYWN0aXRpb25lci03MTQ4MjcxMyIsImlhdCI6MTU1OTEzODkxMywiZXhwIjoxNTU5MTM5MjEzfQ.G2dLcSnjpwM_joWTxWLfL48vhdlj3zGV9Os5cKREYcY"
            }
        });

        env.redirect("http://localhost/?code=123&state=" + key);
        const client = await smart.completeAuth(env);

        // make sure tha browser history was not replaced
        expect(window.history._location).to.equal("");

        expect(
            await Storage.get(smart.KEY),
            `without fullSessionStorageSupport a '${smart.KEY}' key should not be used`
        ).to.not.exist();
        expect(await Storage.get(key), "must have set a state at " + key).to.exist();
        expect(await Storage.get(key)).to.include("tokenResponse");
        expect((await Storage.get(key)).tokenResponse).to.be.object();
        expect(client.getPatientId()).to.equal("b2536dd3-bccd-4d22-8355-ab20acdf240b");
        expect(client.getEncounterId()).to.equal("e3ec2d15-4c27-4607-a45c-2f84962b0700");
        expect(client.getUserId()).to.equal("smart-Practitioner-71482713");
        expect(client.getUserType()).to.equal("Practitioner");
    });

    it ("refresh an authorized page", async () => {

        const env = new BrowserEnv();
        const Storage = env.getStorage();
        const key = "whatever-random-key";

        await Storage.set(smart.KEY, key);
        await Storage.set(key, {
            clientId     : "my_web_app",
            scope        : "whatever",
            redirectUri  : "whatever",
            serverUrl    : mockUrl,
            key,
            tokenResponse: {
                "need_patient_banner": true,
                "smart_style_url": "https://launch.smarthealthit.org/smart-style.json",
                "patient": "b2536dd3-bccd-4d22-8355-ab20acdf240b",
                "encounter": "e3ec2d15-4c27-4607-a45c-2f84962b0700",
                "refresh_token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJjb250ZXh0Ijp7Im5lZWRfcGF0aWVudF9iYW5uZXIiOnRydWUsInNtYXJ0X3N0eWxlX3VybCI6Imh0dHBzOi8vbGF1bmNoLnNtYXJ0aGVhbHRoaXQub3JnL3NtYXJ0LXN0eWxlLmpzb24iLCJwYXRpZW50IjoiYjI1MzZkZDMtYmNjZC00ZDIyLTgzNTUtYWIyMGFjZGYyNDBiIiwiZW5jb3VudGVyIjoiZTNlYzJkMTUtNGMyNy00NjA3LWE0NWMtMmY4NDk2MmIwNzAwIn0sImNsaWVudF9pZCI6Im15X3dlYl9hcHAiLCJzY29wZSI6Im9wZW5pZCBmaGlyVXNlciBvZmZsaW5lX2FjY2VzcyB1c2VyLyouKiBwYXRpZW50LyouKiBsYXVuY2gvZW5jb3VudGVyIGxhdW5jaC9wYXRpZW50IHByb2ZpbGUiLCJ1c2VyIjoiUHJhY3RpdGlvbmVyL3NtYXJ0LVByYWN0aXRpb25lci03MTQ4MjcxMyIsImlhdCI6MTU1OTEzODkxMywiZXhwIjoxNTkwNjc0OTE0fQ.-Ey7wdFSlmfoQrm7HNxAgJQBJPKdtfH7kL1Z91L60_8",
                "token_type": "bearer",
                "scope": "openid fhirUser offline_access user/*.* patient/*.* launch/encounter launch/patient profile",
                "client_id": "my_web_app",
                "expires_in": 3600,
                "id_token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJwcm9maWxlIjoiUHJhY3RpdGlvbmVyL3NtYXJ0LVByYWN0aXRpb25lci03MTQ4MjcxMyIsImZoaXJVc2VyIjoiUHJhY3RpdGlvbmVyL3NtYXJ0LVByYWN0aXRpb25lci03MTQ4MjcxMyIsImF1ZCI6Im15X3dlYl9hcHAiLCJzdWIiOiJkYjIzZDBkZTI1Njc4ZTY3MDk5YmM0MzQzMjNkYzBkOTY1MTNiNTUyMmQ0Yjc0MWNiYTM5ZjdjOTJkMGM0NmFlIiwiaXNzIjoiaHR0cDovL2xhdW5jaC5zbWFydGhlYWx0aGl0Lm9yZyIsImlhdCI6MTU1OTEzODkxNCwiZXhwIjoxNTU5MTQyNTE0fQ.OtbIcs5nyEKaD2kAPasm1DYFixHvVbkC1wQys3oa3T-4Tf8wxW56hzUK0ZQeOK_gEIxiSFn9tLoUvKau_M1WRVD11FPyulvs1Q8EbG5PQ83MBudcpZQJ_uuFbVcGsDMy2xEa_8jAHkHPAVNjj8FRsQCRZC0Hfg0NbXli3yOhAFK1LqTUcrnjfwD-sak0UGQS1H6OgILnTYLrlTTIonfnWRdpWJjjIh3_GCk5k-8LU8AARaPcSE3ZhezoKTSfwQn1XO101g5h337pZleaIlFlhxPRFSKtpXz7BEezkUi5CJqN4d2qNoBK9kapljFYEVdPjRqaBnt4blmyFRXjhdMNwA",
                "access_token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJuZWVkX3BhdGllbnRfYmFubmVyIjp0cnVlLCJzbWFydF9zdHlsZV91cmwiOiJodHRwczovL2xhdW5jaC5zbWFydGhlYWx0aGl0Lm9yZy9zbWFydC1zdHlsZS5qc29uIiwicGF0aWVudCI6ImIyNTM2ZGQzLWJjY2QtNGQyMi04MzU1LWFiMjBhY2RmMjQwYiIsImVuY291bnRlciI6ImUzZWMyZDE1LTRjMjctNDYwNy1hNDVjLTJmODQ5NjJiMDcwMCIsInJlZnJlc2hfdG9rZW4iOiJleUowZVhBaU9pSktWMVFpTENKaGJHY2lPaUpJVXpJMU5pSjkuZXlKamIyNTBaWGgwSWpwN0ltNWxaV1JmY0dGMGFXVnVkRjlpWVc1dVpYSWlPblJ5ZFdVc0luTnRZWEowWDNOMGVXeGxYM1Z5YkNJNkltaDBkSEJ6T2k4dmJHRjFibU5vTG5OdFlYSjBhR1ZoYkhSb2FYUXViM0puTDNOdFlYSjBMWE4wZVd4bExtcHpiMjRpTENKd1lYUnBaVzUwSWpvaVlqSTFNelprWkRNdFltTmpaQzAwWkRJeUxUZ3pOVFV0WVdJeU1HRmpaR1l5TkRCaUlpd2laVzVqYjNWdWRHVnlJam9pWlRObFl6SmtNVFV0TkdNeU55MDBOakEzTFdFME5XTXRNbVk0TkRrMk1tSXdOekF3SW4wc0ltTnNhV1Z1ZEY5cFpDSTZJbTE1WDNkbFlsOWhjSEFpTENKelkyOXdaU0k2SW05d1pXNXBaQ0JtYUdseVZYTmxjaUJ2Wm1ac2FXNWxYMkZqWTJWemN5QjFjMlZ5THlvdUtpQndZWFJwWlc1MEx5b3VLaUJzWVhWdVkyZ3ZaVzVqYjNWdWRHVnlJR3hoZFc1amFDOXdZWFJwWlc1MElIQnliMlpwYkdVaUxDSjFjMlZ5SWpvaVVISmhZM1JwZEdsdmJtVnlMM050WVhKMExWQnlZV04wYVhScGIyNWxjaTAzTVRRNE1qY3hNeUlzSW1saGRDSTZNVFUxT1RFek9Ea3hNeXdpWlhod0lqb3hOVGt3TmpjME9URTBmUS4tRXk3d2RGU2xtZm9Rcm03SE54QWdKUUJKUEtkdGZIN2tMMVo5MUw2MF84IiwidG9rZW5fdHlwZSI6ImJlYXJlciIsInNjb3BlIjoib3BlbmlkIGZoaXJVc2VyIG9mZmxpbmVfYWNjZXNzIHVzZXIvKi4qIHBhdGllbnQvKi4qIGxhdW5jaC9lbmNvdW50ZXIgbGF1bmNoL3BhdGllbnQgcHJvZmlsZSIsImNsaWVudF9pZCI6Im15X3dlYl9hcHAiLCJleHBpcmVzX2luIjozNjAwLCJpZF90b2tlbiI6ImV5SjBlWEFpT2lKS1YxUWlMQ0poYkdjaU9pSlNVekkxTmlKOS5leUp3Y205bWFXeGxJam9pVUhKaFkzUnBkR2x2Ym1WeUwzTnRZWEowTFZCeVlXTjBhWFJwYjI1bGNpMDNNVFE0TWpjeE15SXNJbVpvYVhKVmMyVnlJam9pVUhKaFkzUnBkR2x2Ym1WeUwzTnRZWEowTFZCeVlXTjBhWFJwYjI1bGNpMDNNVFE0TWpjeE15SXNJbUYxWkNJNkltMTVYM2RsWWw5aGNIQWlMQ0p6ZFdJaU9pSmtZakl6WkRCa1pUSTFOamM0WlRZM01EazVZbU0wTXpRek1qTmtZekJrT1RZMU1UTmlOVFV5TW1RMFlqYzBNV05pWVRNNVpqZGpPVEprTUdNME5tRmxJaXdpYVhOeklqb2lhSFIwY0RvdkwyeGhkVzVqYUM1emJXRnlkR2hsWVd4MGFHbDBMbTl5WnlJc0ltbGhkQ0k2TVRVMU9URXpPRGt4TkN3aVpYaHdJam94TlRVNU1UUXlOVEUwZlEuT3RiSWNzNW55RUthRDJrQVBhc20xRFlGaXhIdlZia0Mxd1F5czNvYTNULTRUZjh3eFc1Nmh6VUswWlFlT0tfZ0VJeGlTRm45dExvVXZLYXVfTTFXUlZEMTFGUHl1bHZzMVE4RWJHNVBRODNNQnVkY3BaUUpfdXVGYlZjR3NETXkyeEVhXzhqQUhrSFBBVk5qajhGUnNRQ1JaQzBIZmcwTmJYbGkzeU9oQUZLMUxxVFVjcm5qZndELXNhazBVR1FTMUg2T2dJTG5UWUxybFRUSW9uZm5XUmRwV0pqakloM19HQ2s1ay04TFU4QUFSYVBjU0UzWmhlem9LVFNmd1FuMVhPMTAxZzVoMzM3cFpsZWFJbEZsaHhQUkZTS3RwWHo3QkVlemtVaTVDSnFONGQycU5vQks5a2FwbGpGWUVWZFBqUnFhQm50NGJsbXlGUlhqaGRNTndBIiwiaWF0IjoxNTU5MTM4OTE0LCJleHAiOjE1NTkxNDI1MTR9.lhfmhXYfoaI4QcJYvFnr2FMn_RHO8aXSzzkXzwNpc7w",
                "code": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJjb250ZXh0Ijp7Im5lZWRfcGF0aWVudF9iYW5uZXIiOnRydWUsInNtYXJ0X3N0eWxlX3VybCI6Imh0dHBzOi8vbGF1bmNoLnNtYXJ0aGVhbHRoaXQub3JnL3NtYXJ0LXN0eWxlLmpzb24iLCJwYXRpZW50IjoiYjI1MzZkZDMtYmNjZC00ZDIyLTgzNTUtYWIyMGFjZGYyNDBiIiwiZW5jb3VudGVyIjoiZTNlYzJkMTUtNGMyNy00NjA3LWE0NWMtMmY4NDk2MmIwNzAwIn0sImNsaWVudF9pZCI6Im15X3dlYl9hcHAiLCJzY29wZSI6Im9wZW5pZCBmaGlyVXNlciBvZmZsaW5lX2FjY2VzcyB1c2VyLyouKiBwYXRpZW50LyouKiBsYXVuY2gvZW5jb3VudGVyIGxhdW5jaC9wYXRpZW50IHByb2ZpbGUiLCJ1c2VyIjoiUHJhY3RpdGlvbmVyL3NtYXJ0LVByYWN0aXRpb25lci03MTQ4MjcxMyIsImlhdCI6MTU1OTEzODkxMywiZXhwIjoxNTU5MTM5MjEzfQ.G2dLcSnjpwM_joWTxWLfL48vhdlj3zGV9Os5cKREYcY"
            }
        });

        env.redirect("http://localhost/");
        const client = await smart.completeAuth(env);

        expect(client.patient.id).to.equal("b2536dd3-bccd-4d22-8355-ab20acdf240b");
        expect(client.encounter.id).to.equal("e3ec2d15-4c27-4607-a45c-2f84962b0700");
        expect(client.user.id).to.equal("smart-Practitioner-71482713");
        expect(client.user.resourceType).to.equal("Practitioner");
    });

    it ("refresh an authorized page with fullSessionStorageSupport = false", async () => {

        window.FHIR.oauth2.settings.fullSessionStorageSupport = false;

        const env = new BrowserEnv();
        const Storage = env.getStorage();
        const key = "whatever-random-key";

        await Storage.set(key, {
            clientId   : "my_web_app",
            scope      : "whatever",
            redirectUri: "whatever",
            serverUrl  : mockUrl,
            key,
            tokenResponse: {
                "need_patient_banner": true,
                "smart_style_url": "https://launch.smarthealthit.org/smart-style.json",
                "patient": "b2536dd3-bccd-4d22-8355-ab20acdf240b",
                "encounter": "e3ec2d15-4c27-4607-a45c-2f84962b0700",
                "refresh_token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJjb250ZXh0Ijp7Im5lZWRfcGF0aWVudF9iYW5uZXIiOnRydWUsInNtYXJ0X3N0eWxlX3VybCI6Imh0dHBzOi8vbGF1bmNoLnNtYXJ0aGVhbHRoaXQub3JnL3NtYXJ0LXN0eWxlLmpzb24iLCJwYXRpZW50IjoiYjI1MzZkZDMtYmNjZC00ZDIyLTgzNTUtYWIyMGFjZGYyNDBiIiwiZW5jb3VudGVyIjoiZTNlYzJkMTUtNGMyNy00NjA3LWE0NWMtMmY4NDk2MmIwNzAwIn0sImNsaWVudF9pZCI6Im15X3dlYl9hcHAiLCJzY29wZSI6Im9wZW5pZCBmaGlyVXNlciBvZmZsaW5lX2FjY2VzcyB1c2VyLyouKiBwYXRpZW50LyouKiBsYXVuY2gvZW5jb3VudGVyIGxhdW5jaC9wYXRpZW50IHByb2ZpbGUiLCJ1c2VyIjoiUHJhY3RpdGlvbmVyL3NtYXJ0LVByYWN0aXRpb25lci03MTQ4MjcxMyIsImlhdCI6MTU1OTEzODkxMywiZXhwIjoxNTkwNjc0OTE0fQ.-Ey7wdFSlmfoQrm7HNxAgJQBJPKdtfH7kL1Z91L60_8",
                "token_type": "bearer",
                "scope": "openid fhirUser offline_access user/*.* patient/*.* launch/encounter launch/patient profile",
                "client_id": "my_web_app",
                "expires_in": 3600,
                "id_token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJwcm9maWxlIjoiUHJhY3RpdGlvbmVyL3NtYXJ0LVByYWN0aXRpb25lci03MTQ4MjcxMyIsImZoaXJVc2VyIjoiUHJhY3RpdGlvbmVyL3NtYXJ0LVByYWN0aXRpb25lci03MTQ4MjcxMyIsImF1ZCI6Im15X3dlYl9hcHAiLCJzdWIiOiJkYjIzZDBkZTI1Njc4ZTY3MDk5YmM0MzQzMjNkYzBkOTY1MTNiNTUyMmQ0Yjc0MWNiYTM5ZjdjOTJkMGM0NmFlIiwiaXNzIjoiaHR0cDovL2xhdW5jaC5zbWFydGhlYWx0aGl0Lm9yZyIsImlhdCI6MTU1OTEzODkxNCwiZXhwIjoxNTU5MTQyNTE0fQ.OtbIcs5nyEKaD2kAPasm1DYFixHvVbkC1wQys3oa3T-4Tf8wxW56hzUK0ZQeOK_gEIxiSFn9tLoUvKau_M1WRVD11FPyulvs1Q8EbG5PQ83MBudcpZQJ_uuFbVcGsDMy2xEa_8jAHkHPAVNjj8FRsQCRZC0Hfg0NbXli3yOhAFK1LqTUcrnjfwD-sak0UGQS1H6OgILnTYLrlTTIonfnWRdpWJjjIh3_GCk5k-8LU8AARaPcSE3ZhezoKTSfwQn1XO101g5h337pZleaIlFlhxPRFSKtpXz7BEezkUi5CJqN4d2qNoBK9kapljFYEVdPjRqaBnt4blmyFRXjhdMNwA",
                "access_token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJuZWVkX3BhdGllbnRfYmFubmVyIjp0cnVlLCJzbWFydF9zdHlsZV91cmwiOiJodHRwczovL2xhdW5jaC5zbWFydGhlYWx0aGl0Lm9yZy9zbWFydC1zdHlsZS5qc29uIiwicGF0aWVudCI6ImIyNTM2ZGQzLWJjY2QtNGQyMi04MzU1LWFiMjBhY2RmMjQwYiIsImVuY291bnRlciI6ImUzZWMyZDE1LTRjMjctNDYwNy1hNDVjLTJmODQ5NjJiMDcwMCIsInJlZnJlc2hfdG9rZW4iOiJleUowZVhBaU9pSktWMVFpTENKaGJHY2lPaUpJVXpJMU5pSjkuZXlKamIyNTBaWGgwSWpwN0ltNWxaV1JmY0dGMGFXVnVkRjlpWVc1dVpYSWlPblJ5ZFdVc0luTnRZWEowWDNOMGVXeGxYM1Z5YkNJNkltaDBkSEJ6T2k4dmJHRjFibU5vTG5OdFlYSjBhR1ZoYkhSb2FYUXViM0puTDNOdFlYSjBMWE4wZVd4bExtcHpiMjRpTENKd1lYUnBaVzUwSWpvaVlqSTFNelprWkRNdFltTmpaQzAwWkRJeUxUZ3pOVFV0WVdJeU1HRmpaR1l5TkRCaUlpd2laVzVqYjNWdWRHVnlJam9pWlRObFl6SmtNVFV0TkdNeU55MDBOakEzTFdFME5XTXRNbVk0TkRrMk1tSXdOekF3SW4wc0ltTnNhV1Z1ZEY5cFpDSTZJbTE1WDNkbFlsOWhjSEFpTENKelkyOXdaU0k2SW05d1pXNXBaQ0JtYUdseVZYTmxjaUJ2Wm1ac2FXNWxYMkZqWTJWemN5QjFjMlZ5THlvdUtpQndZWFJwWlc1MEx5b3VLaUJzWVhWdVkyZ3ZaVzVqYjNWdWRHVnlJR3hoZFc1amFDOXdZWFJwWlc1MElIQnliMlpwYkdVaUxDSjFjMlZ5SWpvaVVISmhZM1JwZEdsdmJtVnlMM050WVhKMExWQnlZV04wYVhScGIyNWxjaTAzTVRRNE1qY3hNeUlzSW1saGRDSTZNVFUxT1RFek9Ea3hNeXdpWlhod0lqb3hOVGt3TmpjME9URTBmUS4tRXk3d2RGU2xtZm9Rcm03SE54QWdKUUJKUEtkdGZIN2tMMVo5MUw2MF84IiwidG9rZW5fdHlwZSI6ImJlYXJlciIsInNjb3BlIjoib3BlbmlkIGZoaXJVc2VyIG9mZmxpbmVfYWNjZXNzIHVzZXIvKi4qIHBhdGllbnQvKi4qIGxhdW5jaC9lbmNvdW50ZXIgbGF1bmNoL3BhdGllbnQgcHJvZmlsZSIsImNsaWVudF9pZCI6Im15X3dlYl9hcHAiLCJleHBpcmVzX2luIjozNjAwLCJpZF90b2tlbiI6ImV5SjBlWEFpT2lKS1YxUWlMQ0poYkdjaU9pSlNVekkxTmlKOS5leUp3Y205bWFXeGxJam9pVUhKaFkzUnBkR2x2Ym1WeUwzTnRZWEowTFZCeVlXTjBhWFJwYjI1bGNpMDNNVFE0TWpjeE15SXNJbVpvYVhKVmMyVnlJam9pVUhKaFkzUnBkR2x2Ym1WeUwzTnRZWEowTFZCeVlXTjBhWFJwYjI1bGNpMDNNVFE0TWpjeE15SXNJbUYxWkNJNkltMTVYM2RsWWw5aGNIQWlMQ0p6ZFdJaU9pSmtZakl6WkRCa1pUSTFOamM0WlRZM01EazVZbU0wTXpRek1qTmtZekJrT1RZMU1UTmlOVFV5TW1RMFlqYzBNV05pWVRNNVpqZGpPVEprTUdNME5tRmxJaXdpYVhOeklqb2lhSFIwY0RvdkwyeGhkVzVqYUM1emJXRnlkR2hsWVd4MGFHbDBMbTl5WnlJc0ltbGhkQ0k2TVRVMU9URXpPRGt4TkN3aVpYaHdJam94TlRVNU1UUXlOVEUwZlEuT3RiSWNzNW55RUthRDJrQVBhc20xRFlGaXhIdlZia0Mxd1F5czNvYTNULTRUZjh3eFc1Nmh6VUswWlFlT0tfZ0VJeGlTRm45dExvVXZLYXVfTTFXUlZEMTFGUHl1bHZzMVE4RWJHNVBRODNNQnVkY3BaUUpfdXVGYlZjR3NETXkyeEVhXzhqQUhrSFBBVk5qajhGUnNRQ1JaQzBIZmcwTmJYbGkzeU9oQUZLMUxxVFVjcm5qZndELXNhazBVR1FTMUg2T2dJTG5UWUxybFRUSW9uZm5XUmRwV0pqakloM19HQ2s1ay04TFU4QUFSYVBjU0UzWmhlem9LVFNmd1FuMVhPMTAxZzVoMzM3cFpsZWFJbEZsaHhQUkZTS3RwWHo3QkVlemtVaTVDSnFONGQycU5vQks5a2FwbGpGWUVWZFBqUnFhQm50NGJsbXlGUlhqaGRNTndBIiwiaWF0IjoxNTU5MTM4OTE0LCJleHAiOjE1NTkxNDI1MTR9.lhfmhXYfoaI4QcJYvFnr2FMn_RHO8aXSzzkXzwNpc7w",
                "code": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJjb250ZXh0Ijp7Im5lZWRfcGF0aWVudF9iYW5uZXIiOnRydWUsInNtYXJ0X3N0eWxlX3VybCI6Imh0dHBzOi8vbGF1bmNoLnNtYXJ0aGVhbHRoaXQub3JnL3NtYXJ0LXN0eWxlLmpzb24iLCJwYXRpZW50IjoiYjI1MzZkZDMtYmNjZC00ZDIyLTgzNTUtYWIyMGFjZGYyNDBiIiwiZW5jb3VudGVyIjoiZTNlYzJkMTUtNGMyNy00NjA3LWE0NWMtMmY4NDk2MmIwNzAwIn0sImNsaWVudF9pZCI6Im15X3dlYl9hcHAiLCJzY29wZSI6Im9wZW5pZCBmaGlyVXNlciBvZmZsaW5lX2FjY2VzcyB1c2VyLyouKiBwYXRpZW50LyouKiBsYXVuY2gvZW5jb3VudGVyIGxhdW5jaC9wYXRpZW50IHByb2ZpbGUiLCJ1c2VyIjoiUHJhY3RpdGlvbmVyL3NtYXJ0LVByYWN0aXRpb25lci03MTQ4MjcxMyIsImlhdCI6MTU1OTEzODkxMywiZXhwIjoxNTU5MTM5MjEzfQ.G2dLcSnjpwM_joWTxWLfL48vhdlj3zGV9Os5cKREYcY"
            }
        });

        env.redirect("http://localhost/?state=" + key);
        const client = await smart.completeAuth(env);

        expect(client.patient.id).to.equal("b2536dd3-bccd-4d22-8355-ab20acdf240b");
        expect(client.encounter.id).to.equal("e3ec2d15-4c27-4607-a45c-2f84962b0700");
        expect(client.user.id).to.equal("smart-Practitioner-71482713");
        expect(client.user.resourceType).to.equal("Practitioner");
    });

    it ("can bypass oauth by passing `fhirServiceUrl`", async () => {
        const env = new BrowserEnv();
        const url = await smart.authorize(env, {
            fhirServiceUrl: "http://localhost"
        }, true);

        expect(url).to.match(/http:\/\/localhost\/\?state=./);
    });

    it ("appends 'launch' to the scopes if needed", async () => {
        const env = new BrowserEnv();
        const Storage = env.getStorage();
        const redirect = await smart.authorize(env, {
            fhirServiceUrl: "http://localhost",
            scope: "x",
            launch: "123"
        }, true);
        const state = (new URL(redirect)).searchParams.get("state");
        expect((await Storage.get(state)).scope).to.equal("x launch");
    });

    it ("can do standalone launch", async () => {

        const env     = new BrowserEnv();
        const Storage = env.getStorage();

        // mock our oauth endpoints
        mockServer.mock({
            headers: { "content-type": "application/json" },
            status: 200,
            body: {
                authorization_endpoint: mockUrl,
                token_endpoint: mockUrl
            }
        });

        // Call our launch code.
        await smart.authorize(env, {
            iss: mockUrl,
            // launch: "123",
            scope: "my_scope",
            client_id: "my_client_id"
        });

        // Now we have been redirected to `redirect` and then back to our
        // redirect_uri. It is time to complete the authorization.

        // Get the state parameter from the URL
        const redirect = env.getUrl(); // console.log(redirect, storage);
        const state = redirect.searchParams.get("state");

        expect(await Storage.get(state), "must have set a state at " + state).to.exist();

        // mock our access token response
        mockServer.mock({
            headers: { "content-type": "application/json" },
            status: 200,
            body: {
                "need_patient_banner": true,
                "smart_style_url": "https://launch.smarthealthit.org/smart-style.json",
                "patient": "b2536dd3-bccd-4d22-8355-ab20acdf240b",
                "encounter": "e3ec2d15-4c27-4607-a45c-2f84962b0700",
                "refresh_token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJjb250ZXh0Ijp7Im5lZWRfcGF0aWVudF9iYW5uZXIiOnRydWUsInNtYXJ0X3N0eWxlX3VybCI6Imh0dHBzOi8vbGF1bmNoLnNtYXJ0aGVhbHRoaXQub3JnL3NtYXJ0LXN0eWxlLmpzb24iLCJwYXRpZW50IjoiYjI1MzZkZDMtYmNjZC00ZDIyLTgzNTUtYWIyMGFjZGYyNDBiIiwiZW5jb3VudGVyIjoiZTNlYzJkMTUtNGMyNy00NjA3LWE0NWMtMmY4NDk2MmIwNzAwIn0sImNsaWVudF9pZCI6Im15X3dlYl9hcHAiLCJzY29wZSI6Im9wZW5pZCBmaGlyVXNlciBvZmZsaW5lX2FjY2VzcyB1c2VyLyouKiBwYXRpZW50LyouKiBsYXVuY2gvZW5jb3VudGVyIGxhdW5jaC9wYXRpZW50IHByb2ZpbGUiLCJ1c2VyIjoiUHJhY3RpdGlvbmVyL3NtYXJ0LVByYWN0aXRpb25lci03MTQ4MjcxMyIsImlhdCI6MTU1OTEzODkxMywiZXhwIjoxNTkwNjc0OTE0fQ.-Ey7wdFSlmfoQrm7HNxAgJQBJPKdtfH7kL1Z91L60_8",
                "token_type": "bearer",
                "scope": "openid fhirUser offline_access user/*.* patient/*.* launch/encounter launch/patient profile",
                "client_id": "my_web_app",
                "expires_in": 3600,
                "id_token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJwcm9maWxlIjoiUHJhY3RpdGlvbmVyL3NtYXJ0LVByYWN0aXRpb25lci03MTQ4MjcxMyIsImZoaXJVc2VyIjoiUHJhY3RpdGlvbmVyL3NtYXJ0LVByYWN0aXRpb25lci03MTQ4MjcxMyIsImF1ZCI6Im15X3dlYl9hcHAiLCJzdWIiOiJkYjIzZDBkZTI1Njc4ZTY3MDk5YmM0MzQzMjNkYzBkOTY1MTNiNTUyMmQ0Yjc0MWNiYTM5ZjdjOTJkMGM0NmFlIiwiaXNzIjoiaHR0cDovL2xhdW5jaC5zbWFydGhlYWx0aGl0Lm9yZyIsImlhdCI6MTU1OTEzODkxNCwiZXhwIjoxNTU5MTQyNTE0fQ.OtbIcs5nyEKaD2kAPasm1DYFixHvVbkC1wQys3oa3T-4Tf8wxW56hzUK0ZQeOK_gEIxiSFn9tLoUvKau_M1WRVD11FPyulvs1Q8EbG5PQ83MBudcpZQJ_uuFbVcGsDMy2xEa_8jAHkHPAVNjj8FRsQCRZC0Hfg0NbXli3yOhAFK1LqTUcrnjfwD-sak0UGQS1H6OgILnTYLrlTTIonfnWRdpWJjjIh3_GCk5k-8LU8AARaPcSE3ZhezoKTSfwQn1XO101g5h337pZleaIlFlhxPRFSKtpXz7BEezkUi5CJqN4d2qNoBK9kapljFYEVdPjRqaBnt4blmyFRXjhdMNwA",
                "access_token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJuZWVkX3BhdGllbnRfYmFubmVyIjp0cnVlLCJzbWFydF9zdHlsZV91cmwiOiJodHRwczovL2xhdW5jaC5zbWFydGhlYWx0aGl0Lm9yZy9zbWFydC1zdHlsZS5qc29uIiwicGF0aWVudCI6ImIyNTM2ZGQzLWJjY2QtNGQyMi04MzU1LWFiMjBhY2RmMjQwYiIsImVuY291bnRlciI6ImUzZWMyZDE1LTRjMjctNDYwNy1hNDVjLTJmODQ5NjJiMDcwMCIsInJlZnJlc2hfdG9rZW4iOiJleUowZVhBaU9pSktWMVFpTENKaGJHY2lPaUpJVXpJMU5pSjkuZXlKamIyNTBaWGgwSWpwN0ltNWxaV1JmY0dGMGFXVnVkRjlpWVc1dVpYSWlPblJ5ZFdVc0luTnRZWEowWDNOMGVXeGxYM1Z5YkNJNkltaDBkSEJ6T2k4dmJHRjFibU5vTG5OdFlYSjBhR1ZoYkhSb2FYUXViM0puTDNOdFlYSjBMWE4wZVd4bExtcHpiMjRpTENKd1lYUnBaVzUwSWpvaVlqSTFNelprWkRNdFltTmpaQzAwWkRJeUxUZ3pOVFV0WVdJeU1HRmpaR1l5TkRCaUlpd2laVzVqYjNWdWRHVnlJam9pWlRObFl6SmtNVFV0TkdNeU55MDBOakEzTFdFME5XTXRNbVk0TkRrMk1tSXdOekF3SW4wc0ltTnNhV1Z1ZEY5cFpDSTZJbTE1WDNkbFlsOWhjSEFpTENKelkyOXdaU0k2SW05d1pXNXBaQ0JtYUdseVZYTmxjaUJ2Wm1ac2FXNWxYMkZqWTJWemN5QjFjMlZ5THlvdUtpQndZWFJwWlc1MEx5b3VLaUJzWVhWdVkyZ3ZaVzVqYjNWdWRHVnlJR3hoZFc1amFDOXdZWFJwWlc1MElIQnliMlpwYkdVaUxDSjFjMlZ5SWpvaVVISmhZM1JwZEdsdmJtVnlMM050WVhKMExWQnlZV04wYVhScGIyNWxjaTAzTVRRNE1qY3hNeUlzSW1saGRDSTZNVFUxT1RFek9Ea3hNeXdpWlhod0lqb3hOVGt3TmpjME9URTBmUS4tRXk3d2RGU2xtZm9Rcm03SE54QWdKUUJKUEtkdGZIN2tMMVo5MUw2MF84IiwidG9rZW5fdHlwZSI6ImJlYXJlciIsInNjb3BlIjoib3BlbmlkIGZoaXJVc2VyIG9mZmxpbmVfYWNjZXNzIHVzZXIvKi4qIHBhdGllbnQvKi4qIGxhdW5jaC9lbmNvdW50ZXIgbGF1bmNoL3BhdGllbnQgcHJvZmlsZSIsImNsaWVudF9pZCI6Im15X3dlYl9hcHAiLCJleHBpcmVzX2luIjozNjAwLCJpZF90b2tlbiI6ImV5SjBlWEFpT2lKS1YxUWlMQ0poYkdjaU9pSlNVekkxTmlKOS5leUp3Y205bWFXeGxJam9pVUhKaFkzUnBkR2x2Ym1WeUwzTnRZWEowTFZCeVlXTjBhWFJwYjI1bGNpMDNNVFE0TWpjeE15SXNJbVpvYVhKVmMyVnlJam9pVUhKaFkzUnBkR2x2Ym1WeUwzTnRZWEowTFZCeVlXTjBhWFJwYjI1bGNpMDNNVFE0TWpjeE15SXNJbUYxWkNJNkltMTVYM2RsWWw5aGNIQWlMQ0p6ZFdJaU9pSmtZakl6WkRCa1pUSTFOamM0WlRZM01EazVZbU0wTXpRek1qTmtZekJrT1RZMU1UTmlOVFV5TW1RMFlqYzBNV05pWVRNNVpqZGpPVEprTUdNME5tRmxJaXdpYVhOeklqb2lhSFIwY0RvdkwyeGhkVzVqYUM1emJXRnlkR2hsWVd4MGFHbDBMbTl5WnlJc0ltbGhkQ0k2TVRVMU9URXpPRGt4TkN3aVpYaHdJam94TlRVNU1UUXlOVEUwZlEuT3RiSWNzNW55RUthRDJrQVBhc20xRFlGaXhIdlZia0Mxd1F5czNvYTNULTRUZjh3eFc1Nmh6VUswWlFlT0tfZ0VJeGlTRm45dExvVXZLYXVfTTFXUlZEMTFGUHl1bHZzMVE4RWJHNVBRODNNQnVkY3BaUUpfdXVGYlZjR3NETXkyeEVhXzhqQUhrSFBBVk5qajhGUnNRQ1JaQzBIZmcwTmJYbGkzeU9oQUZLMUxxVFVjcm5qZndELXNhazBVR1FTMUg2T2dJTG5UWUxybFRUSW9uZm5XUmRwV0pqakloM19HQ2s1ay04TFU4QUFSYVBjU0UzWmhlem9LVFNmd1FuMVhPMTAxZzVoMzM3cFpsZWFJbEZsaHhQUkZTS3RwWHo3QkVlemtVaTVDSnFONGQycU5vQks5a2FwbGpGWUVWZFBqUnFhQm50NGJsbXlGUlhqaGRNTndBIiwiaWF0IjoxNTU5MTM4OTE0LCJleHAiOjE1NTkxNDI1MTR9.lhfmhXYfoaI4QcJYvFnr2FMn_RHO8aXSzzkXzwNpc7w",
                "code": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJjb250ZXh0Ijp7Im5lZWRfcGF0aWVudF9iYW5uZXIiOnRydWUsInNtYXJ0X3N0eWxlX3VybCI6Imh0dHBzOi8vbGF1bmNoLnNtYXJ0aGVhbHRoaXQub3JnL3NtYXJ0LXN0eWxlLmpzb24iLCJwYXRpZW50IjoiYjI1MzZkZDMtYmNjZC00ZDIyLTgzNTUtYWIyMGFjZGYyNDBiIiwiZW5jb3VudGVyIjoiZTNlYzJkMTUtNGMyNy00NjA3LWE0NWMtMmY4NDk2MmIwNzAwIn0sImNsaWVudF9pZCI6Im15X3dlYl9hcHAiLCJzY29wZSI6Im9wZW5pZCBmaGlyVXNlciBvZmZsaW5lX2FjY2VzcyB1c2VyLyouKiBwYXRpZW50LyouKiBsYXVuY2gvZW5jb3VudGVyIGxhdW5jaC9wYXRpZW50IHByb2ZpbGUiLCJ1c2VyIjoiUHJhY3RpdGlvbmVyL3NtYXJ0LVByYWN0aXRpb25lci03MTQ4MjcxMyIsImlhdCI6MTU1OTEzODkxMywiZXhwIjoxNTU5MTM5MjEzfQ.G2dLcSnjpwM_joWTxWLfL48vhdlj3zGV9Os5cKREYcY",
                state
            }
        });

        env.redirect("http://localhost/?code=123&state=" + state);
        const client = await smart.completeAuth(env);

        expect(await Storage.get(smart.KEY), `must have set a state at ${smart.KEY}`).to.exist();
        expect(client.getPatientId()).to.equal("b2536dd3-bccd-4d22-8355-ab20acdf240b");
        expect(client.getEncounterId()).to.equal("e3ec2d15-4c27-4607-a45c-2f84962b0700");
        expect(client.getUserId()).to.equal("smart-Practitioner-71482713");
        expect(client.getUserType()).to.equal("Practitioner");
    });
});

describe("smart", () => {

    describe("fetchConformanceStatement", () => {

        it ("rejects bad baseUrl values", async () => {
            await expect(smart.fetchConformanceStatement("")).to.reject();
            await expect(smart.fetchConformanceStatement(null)).to.reject();
            await expect(smart.fetchConformanceStatement("whatever")).to.reject();
        });

        it("works", async () => {
            mockServer.mock({
                headers: { "content-type": "application/json" },
                status: 200,
                body: {
                    resourceType: "Conformance"
                }
            });
            const conformance = await smart.fetchConformanceStatement(mockUrl);
            expect(conformance).to.equal({resourceType: "Conformance"});
        });

        it("rejects on error", async () => {
            mockServer.mock({
                status: 404,
                body: "Not Found"
            });
            await expect(smart.fetchConformanceStatement(mockUrl)).to.reject(Error, /Not Found/);
        });
    });

    describe("fetchWellKnownJson", () => {
        it("works", async () => {
            mockServer.mock({
                headers: { "content-type": "application/json" },
                status: 200,
                body: {
                    resourceType: "fetchWellKnownJson"
                }
            });
            const conformance = await smart.fetchWellKnownJson(mockUrl);
            expect(conformance).to.equal({resourceType: "fetchWellKnownJson"});
        });

        it("rejects on error", async () => {
            mockServer.mock({
                status: 404,
                body: "Not Found"
            });
            await expect(smart.fetchWellKnownJson(mockUrl)).to.reject(Error, /Not Found/);
        });
    });

    describe("getSecurityExtensions", () => {
        it("works with .well-known/smart-configuration", async () => {
            mockServer.mock({
                headers: { "content-type": "application/json" },
                status: 200,
                body: {
                    registration_endpoint : "https://my-register-uri",
                    authorization_endpoint: "https://my-authorize-uri",
                    token_endpoint        : "https://my-token-uri"
                }
            });

            const result = await smart.getSecurityExtensions(mockUrl);
            expect(result).to.equal({
                registrationUri : "https://my-register-uri",
                authorizeUri    : "https://my-authorize-uri",
                tokenUri        : "https://my-token-uri"
            });
        });

        it("fails back to conformance if .well-known/smart-configuration is bad", async () => {
            mockServer.mock({
                headers: { "content-type": "application/json" },
                status : 200,
                body   : {
                    registration_endpoint: "whatever"
                }
            });
            mockServer.mock({
                headers: { "content-type": "application/json" },
                status: 200,
                body: {
                    rest: [
                        {
                            security: {
                                extension: [
                                    {
                                        url: "http://fhir-registry.smarthealthit.org/StructureDefinition/oauth-uris",
                                        extension: [
                                            {
                                                url: "authorize",
                                                valueUri: "https://my-authorize-uri"
                                            },
                                            {
                                                url: "token",
                                                valueUri: "https://my-token-uri"
                                            },
                                            {
                                                url: "register",
                                                valueUri: "https://my-registration-uri"
                                            }
                                        ]
                                    }
                                ]
                            }
                        }
                    ]
                }
            });

            const result = await smart.getSecurityExtensions(mockUrl);
            expect(result).to.equal({
                registrationUri : "https://my-registration-uri",
                authorizeUri    : "https://my-authorize-uri",
                tokenUri        : "https://my-token-uri"
            });
        });

        it("works with conformance statement", async () => {
            mockServer.mock({
                status: 200,
                headers: { "content-type": "application/json" },
                body: {
                    authorization_endpoint: "whatever"
                }
            });
            mockServer.mock({
                headers: { "content-type": "application/json" },
                status: 200,
                body: {
                    rest: [
                        {
                            security: {
                                extension: [
                                    {
                                        url: "http://fhir-registry.smarthealthit.org/StructureDefinition/oauth-uris",
                                        extension: [
                                            {
                                                url: "authorize",
                                                valueUri: "https://my-authorize-uri"
                                            },
                                            {
                                                url: "token",
                                                valueUri: "https://my-token-uri"
                                            }
                                        ]
                                    }
                                ]
                            }
                        }
                    ]
                }
            });

            const result = await smart.getSecurityExtensions(mockUrl);
            expect(result).to.equal({
                registrationUri : "",
                authorizeUri    : "https://my-authorize-uri",
                tokenUri        : "https://my-token-uri"
            });
        });

        it("returns empty endpoints for open servers", async () => {
            mockServer.mock({
                status: 404,
                body: "Not Found"
            });
            mockServer.mock({
                headers: { "content-type": "application/json" },
                status: 200,
                body: {rest: [{}]}
            });

            const result = await smart.getSecurityExtensions(mockUrl);
            expect(result).to.equal({
                registrationUri : "",
                authorizeUri    : "",
                tokenUri        : ""
            });
        });

        it("returns empty endpoints for missing conformance", async () => {
            mockServer.mock({
                status: 404,
                body: "Not Found"
            });
            mockServer.mock({
                headers: { "content-type": "application/json" },
                status: 200,
                // body: {}
            });

            const result = await smart.getSecurityExtensions(mockUrl);
            expect(result).to.equal({
                registrationUri : "",
                authorizeUri    : "",
                tokenUri        : ""
            });
        });

        it("rejects on error", async () => {
            mockServer.mock({
                headers: { "content-type": "application/json" },
                status: 400,
                body: {
                    authorization_endpoint: "whatever"
                }
            });
            mockServer.mock({
                headers: { "content-type": "application/json" },
                status: 400,
                body: {}
            });
            await expect(smart.getSecurityExtensions(mockUrl)).to.reject();
        });
    });

    describe("authorize", () => {

        it ("throws if no serverUrl", async () => {
            await expect(smart.authorize(new BrowserEnv(), {}))
                .to.reject(Error, /No server url found/);
        });

        it ("accepts encounterId parameter", async () => {
            const env = new BrowserEnv();
            const url = await smart.authorize(env, {
                fhirServiceUrl: "http://localhost",
                encounterId: "whatever"
            }, true);
            const state = (new URL(url)).searchParams.get("state");
            expect(await env.getStorage().get(state)).to.include({
                tokenResponse: { encounter: "whatever" }
            });
        });

        it ("accepts patientId parameter", async () => {
            const env = new BrowserEnv();
            const url = await smart.authorize(env, {
                fhirServiceUrl: "http://localhost",
                patientId: "whatever"
            }, true);
            const state = (new URL(url)).searchParams.get("state");
            expect(await env.getStorage().get(state)).to.include({
                tokenResponse: { patient: "whatever" }
            });
        });

        it ("accepts fakeTokenResponse parameter", async () => {
            const env = new BrowserEnv();
            const url = await smart.authorize(env, {
                fhirServiceUrl: "http://localhost",
                fakeTokenResponse: { a: 1, b: 2 }
            }, true);
            const state = (new URL(url)).searchParams.get("state");
            expect(await env.getStorage().get(state)).to.include({
                tokenResponse: { a: 1, b: 2 }
            });
        });
    });

    describe("completeAuth", () => {

        it ("rejects with error and error_description from the url", async () => {
            const env = new BrowserEnv();
            env.redirect("http://localhost/?error=test-error");
            await expect(smart.completeAuth(env, {}))
                .to.reject(Error, "test-error");
            env.redirect("http://localhost/?error_description=test-error-description");
            await expect(smart.completeAuth(env, {}))
                .to.reject(Error, "test-error-description");
            env.redirect("http://localhost/?error=test-error&error_description=test-error-description");
            await expect(smart.completeAuth(env, {}))
                .to.reject(Error, "test-error: test-error-description");
        });

        it ("rejects with missing key", async () => {
            const env = new BrowserEnv();
            env.redirect("http://localhost/");
            await expect(smart.completeAuth(env, {}))
                .to.reject(Error, /^No 'state' parameter found/);
        });

        it ("rejects with empty state", async () => {
            const env = new BrowserEnv();
            env.redirect("http://localhost/?state=whatever");
            await expect(smart.completeAuth(env, {}))
                .to.reject(Error, /No state found/);
        });

    });

    describe("buildTokenRequest", () => {

        it ("rejects with missing state.redirectUri", () => {
            expect(() => smart.buildTokenRequest("whatever", {

            })).to.throw(Error, "Missing state.redirectUri");
        });
        it ("rejects with missing state.tokenUri", () => {
            expect(() => smart.buildTokenRequest("whatever", {
                redirectUri: "whatever"
            })).to.throw(Error, "Missing state.tokenUri");
        });
        it ("rejects with missing state.clientId", () => {
            expect(() => smart.buildTokenRequest("whatever", {
                redirectUri: "whatever",
                tokenUri: "whatever"
            })).to.throw(Error, "Missing state.clientId");
        });

    });

    describe("init", () => {
        it ("works in standalone mode", async () => {
            mockServer.mock({
                headers: { "content-type": "application/json" },
                status: 200,
                body: {
                    authorization_endpoint: mockUrl,
                    token_endpoint: mockUrl
                }
            });

            mockServer.mock({
                headers: { "content-type": "application/json" },
                status: 200,
                body: {
                    "need_patient_banner": true,
                    "smart_style_url": "https://launch.smarthealthit.org/smart-style.json",
                    "patient": "b2536dd3-bccd-4d22-8355-ab20acdf240b",
                    "encounter": "e3ec2d15-4c27-4607-a45c-2f84962b0700",
                    "refresh_token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJjb250ZXh0Ijp7Im5lZWRfcGF0aWVudF9iYW5uZXIiOnRydWUsInNtYXJ0X3N0eWxlX3VybCI6Imh0dHBzOi8vbGF1bmNoLnNtYXJ0aGVhbHRoaXQub3JnL3NtYXJ0LXN0eWxlLmpzb24iLCJwYXRpZW50IjoiYjI1MzZkZDMtYmNjZC00ZDIyLTgzNTUtYWIyMGFjZGYyNDBiIiwiZW5jb3VudGVyIjoiZTNlYzJkMTUtNGMyNy00NjA3LWE0NWMtMmY4NDk2MmIwNzAwIn0sImNsaWVudF9pZCI6Im15X3dlYl9hcHAiLCJzY29wZSI6Im9wZW5pZCBmaGlyVXNlciBvZmZsaW5lX2FjY2VzcyB1c2VyLyouKiBwYXRpZW50LyouKiBsYXVuY2gvZW5jb3VudGVyIGxhdW5jaC9wYXRpZW50IHByb2ZpbGUiLCJ1c2VyIjoiUHJhY3RpdGlvbmVyL3NtYXJ0LVByYWN0aXRpb25lci03MTQ4MjcxMyIsImlhdCI6MTU1OTEzODkxMywiZXhwIjoxNTkwNjc0OTE0fQ.-Ey7wdFSlmfoQrm7HNxAgJQBJPKdtfH7kL1Z91L60_8",
                    "token_type": "bearer",
                    "scope": "openid fhirUser offline_access user/*.* patient/*.* launch/encounter launch/patient profile",
                    "client_id": "my_web_app",
                    "expires_in": 3600,
                    "id_token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJwcm9maWxlIjoiUHJhY3RpdGlvbmVyL3NtYXJ0LVByYWN0aXRpb25lci03MTQ4MjcxMyIsImZoaXJVc2VyIjoiUHJhY3RpdGlvbmVyL3NtYXJ0LVByYWN0aXRpb25lci03MTQ4MjcxMyIsImF1ZCI6Im15X3dlYl9hcHAiLCJzdWIiOiJkYjIzZDBkZTI1Njc4ZTY3MDk5YmM0MzQzMjNkYzBkOTY1MTNiNTUyMmQ0Yjc0MWNiYTM5ZjdjOTJkMGM0NmFlIiwiaXNzIjoiaHR0cDovL2xhdW5jaC5zbWFydGhlYWx0aGl0Lm9yZyIsImlhdCI6MTU1OTEzODkxNCwiZXhwIjoxNTU5MTQyNTE0fQ.OtbIcs5nyEKaD2kAPasm1DYFixHvVbkC1wQys3oa3T-4Tf8wxW56hzUK0ZQeOK_gEIxiSFn9tLoUvKau_M1WRVD11FPyulvs1Q8EbG5PQ83MBudcpZQJ_uuFbVcGsDMy2xEa_8jAHkHPAVNjj8FRsQCRZC0Hfg0NbXli3yOhAFK1LqTUcrnjfwD-sak0UGQS1H6OgILnTYLrlTTIonfnWRdpWJjjIh3_GCk5k-8LU8AARaPcSE3ZhezoKTSfwQn1XO101g5h337pZleaIlFlhxPRFSKtpXz7BEezkUi5CJqN4d2qNoBK9kapljFYEVdPjRqaBnt4blmyFRXjhdMNwA",
                    "access_token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJuZWVkX3BhdGllbnRfYmFubmVyIjp0cnVlLCJzbWFydF9zdHlsZV91cmwiOiJodHRwczovL2xhdW5jaC5zbWFydGhlYWx0aGl0Lm9yZy9zbWFydC1zdHlsZS5qc29uIiwicGF0aWVudCI6ImIyNTM2ZGQzLWJjY2QtNGQyMi04MzU1LWFiMjBhY2RmMjQwYiIsImVuY291bnRlciI6ImUzZWMyZDE1LTRjMjctNDYwNy1hNDVjLTJmODQ5NjJiMDcwMCIsInJlZnJlc2hfdG9rZW4iOiJleUowZVhBaU9pSktWMVFpTENKaGJHY2lPaUpJVXpJMU5pSjkuZXlKamIyNTBaWGgwSWpwN0ltNWxaV1JmY0dGMGFXVnVkRjlpWVc1dVpYSWlPblJ5ZFdVc0luTnRZWEowWDNOMGVXeGxYM1Z5YkNJNkltaDBkSEJ6T2k4dmJHRjFibU5vTG5OdFlYSjBhR1ZoYkhSb2FYUXViM0puTDNOdFlYSjBMWE4wZVd4bExtcHpiMjRpTENKd1lYUnBaVzUwSWpvaVlqSTFNelprWkRNdFltTmpaQzAwWkRJeUxUZ3pOVFV0WVdJeU1HRmpaR1l5TkRCaUlpd2laVzVqYjNWdWRHVnlJam9pWlRObFl6SmtNVFV0TkdNeU55MDBOakEzTFdFME5XTXRNbVk0TkRrMk1tSXdOekF3SW4wc0ltTnNhV1Z1ZEY5cFpDSTZJbTE1WDNkbFlsOWhjSEFpTENKelkyOXdaU0k2SW05d1pXNXBaQ0JtYUdseVZYTmxjaUJ2Wm1ac2FXNWxYMkZqWTJWemN5QjFjMlZ5THlvdUtpQndZWFJwWlc1MEx5b3VLaUJzWVhWdVkyZ3ZaVzVqYjNWdWRHVnlJR3hoZFc1amFDOXdZWFJwWlc1MElIQnliMlpwYkdVaUxDSjFjMlZ5SWpvaVVISmhZM1JwZEdsdmJtVnlMM050WVhKMExWQnlZV04wYVhScGIyNWxjaTAzTVRRNE1qY3hNeUlzSW1saGRDSTZNVFUxT1RFek9Ea3hNeXdpWlhod0lqb3hOVGt3TmpjME9URTBmUS4tRXk3d2RGU2xtZm9Rcm03SE54QWdKUUJKUEtkdGZIN2tMMVo5MUw2MF84IiwidG9rZW5fdHlwZSI6ImJlYXJlciIsInNjb3BlIjoib3BlbmlkIGZoaXJVc2VyIG9mZmxpbmVfYWNjZXNzIHVzZXIvKi4qIHBhdGllbnQvKi4qIGxhdW5jaC9lbmNvdW50ZXIgbGF1bmNoL3BhdGllbnQgcHJvZmlsZSIsImNsaWVudF9pZCI6Im15X3dlYl9hcHAiLCJleHBpcmVzX2luIjozNjAwLCJpZF90b2tlbiI6ImV5SjBlWEFpT2lKS1YxUWlMQ0poYkdjaU9pSlNVekkxTmlKOS5leUp3Y205bWFXeGxJam9pVUhKaFkzUnBkR2x2Ym1WeUwzTnRZWEowTFZCeVlXTjBhWFJwYjI1bGNpMDNNVFE0TWpjeE15SXNJbVpvYVhKVmMyVnlJam9pVUhKaFkzUnBkR2x2Ym1WeUwzTnRZWEowTFZCeVlXTjBhWFJwYjI1bGNpMDNNVFE0TWpjeE15SXNJbUYxWkNJNkltMTVYM2RsWWw5aGNIQWlMQ0p6ZFdJaU9pSmtZakl6WkRCa1pUSTFOamM0WlRZM01EazVZbU0wTXpRek1qTmtZekJrT1RZMU1UTmlOVFV5TW1RMFlqYzBNV05pWVRNNVpqZGpPVEprTUdNME5tRmxJaXdpYVhOeklqb2lhSFIwY0RvdkwyeGhkVzVqYUM1emJXRnlkR2hsWVd4MGFHbDBMbTl5WnlJc0ltbGhkQ0k2TVRVMU9URXpPRGt4TkN3aVpYaHdJam94TlRVNU1UUXlOVEUwZlEuT3RiSWNzNW55RUthRDJrQVBhc20xRFlGaXhIdlZia0Mxd1F5czNvYTNULTRUZjh3eFc1Nmh6VUswWlFlT0tfZ0VJeGlTRm45dExvVXZLYXVfTTFXUlZEMTFGUHl1bHZzMVE4RWJHNVBRODNNQnVkY3BaUUpfdXVGYlZjR3NETXkyeEVhXzhqQUhrSFBBVk5qajhGUnNRQ1JaQzBIZmcwTmJYbGkzeU9oQUZLMUxxVFVjcm5qZndELXNhazBVR1FTMUg2T2dJTG5UWUxybFRUSW9uZm5XUmRwV0pqakloM19HQ2s1ay04TFU4QUFSYVBjU0UzWmhlem9LVFNmd1FuMVhPMTAxZzVoMzM3cFpsZWFJbEZsaHhQUkZTS3RwWHo3QkVlemtVaTVDSnFONGQycU5vQks5a2FwbGpGWUVWZFBqUnFhQm50NGJsbXlGUlhqaGRNTndBIiwiaWF0IjoxNTU5MTM4OTE0LCJleHAiOjE1NTkxNDI1MTR9.lhfmhXYfoaI4QcJYvFnr2FMn_RHO8aXSzzkXzwNpc7w",
                    "code": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJjb250ZXh0Ijp7Im5lZWRfcGF0aWVudF9iYW5uZXIiOnRydWUsInNtYXJ0X3N0eWxlX3VybCI6Imh0dHBzOi8vbGF1bmNoLnNtYXJ0aGVhbHRoaXQub3JnL3NtYXJ0LXN0eWxlLmpzb24iLCJwYXRpZW50IjoiYjI1MzZkZDMtYmNjZC00ZDIyLTgzNTUtYWIyMGFjZGYyNDBiIiwiZW5jb3VudGVyIjoiZTNlYzJkMTUtNGMyNy00NjA3LWE0NWMtMmY4NDk2MmIwNzAwIn0sImNsaWVudF9pZCI6Im15X3dlYl9hcHAiLCJzY29wZSI6Im9wZW5pZCBmaGlyVXNlciBvZmZsaW5lX2FjY2VzcyB1c2VyLyouKiBwYXRpZW50LyouKiBsYXVuY2gvZW5jb3VudGVyIGxhdW5jaC9wYXRpZW50IHByb2ZpbGUiLCJ1c2VyIjoiUHJhY3RpdGlvbmVyL3NtYXJ0LVByYWN0aXRpb25lci03MTQ4MjcxMyIsImlhdCI6MTU1OTEzODkxMywiZXhwIjoxNTU5MTM5MjEzfQ.G2dLcSnjpwM_joWTxWLfL48vhdlj3zGV9Os5cKREYcY"
                }
            });

            const env = new BrowserEnv();

            let client = await new Promise((resolve, reject) => {

                env.once("redirect", async () => {
                    env.redirect("http://localhost/?code=123&state=" + env.getUrl().searchParams.get("state"));
                    smart.init(env, {
                        client_id : "my_web_app",
                        scope     : "launch/patient",
                        iss       : mockUrl
                    }).then(resolve).catch(reject);
                });

                // This first call will NEVER resolve, but it will
                // trigger a "redirect" event
                smart.init(env, {
                    client_id : "my_web_app",
                    scope     : "launch/patient",
                    iss       : mockUrl
                }).catch(reject);
            });

            expect(client.getPatientId()).to.equal("b2536dd3-bccd-4d22-8355-ab20acdf240b");
            expect(client.getEncounterId()).to.equal("e3ec2d15-4c27-4607-a45c-2f84962b0700");
            expect(client.getUserId()).to.equal("smart-Practitioner-71482713");
            expect(client.getUserType()).to.equal("Practitioner");

            // Now rey once again to test the page refresh flow
            env.redirect("http://localhost/?state=" + env.getUrl().searchParams.get("state"));
            client = await smart.init(env, {
                client_id : "my_web_app",
                scope     : "launch/patient",
                iss       : mockUrl
            });

            expect(client.getPatientId()).to.equal("b2536dd3-bccd-4d22-8355-ab20acdf240b");
            expect(client.getEncounterId()).to.equal("e3ec2d15-4c27-4607-a45c-2f84962b0700");
            expect(client.getUserId()).to.equal("smart-Practitioner-71482713");
            expect(client.getUserType()).to.equal("Practitioner");
        });

        it ("works in EHR mode", async () => {
            const key = "my-key";

            mockServer.mock({
                headers: { "content-type": "application/json" },
                status: 200,
                body: {
                    authorization_endpoint: mockUrl,
                    token_endpoint: mockUrl
                }
            });

            mockServer.mock({
                headers: { "content-type": "application/json" },
                status: 200,
                body: {
                    "need_patient_banner": true,
                    "smart_style_url": "https://launch.smarthealthit.org/smart-style.json",
                    "patient": "b2536dd3-bccd-4d22-8355-ab20acdf240b",
                    "encounter": "e3ec2d15-4c27-4607-a45c-2f84962b0700",
                    "refresh_token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJjb250ZXh0Ijp7Im5lZWRfcGF0aWVudF9iYW5uZXIiOnRydWUsInNtYXJ0X3N0eWxlX3VybCI6Imh0dHBzOi8vbGF1bmNoLnNtYXJ0aGVhbHRoaXQub3JnL3NtYXJ0LXN0eWxlLmpzb24iLCJwYXRpZW50IjoiYjI1MzZkZDMtYmNjZC00ZDIyLTgzNTUtYWIyMGFjZGYyNDBiIiwiZW5jb3VudGVyIjoiZTNlYzJkMTUtNGMyNy00NjA3LWE0NWMtMmY4NDk2MmIwNzAwIn0sImNsaWVudF9pZCI6Im15X3dlYl9hcHAiLCJzY29wZSI6Im9wZW5pZCBmaGlyVXNlciBvZmZsaW5lX2FjY2VzcyB1c2VyLyouKiBwYXRpZW50LyouKiBsYXVuY2gvZW5jb3VudGVyIGxhdW5jaC9wYXRpZW50IHByb2ZpbGUiLCJ1c2VyIjoiUHJhY3RpdGlvbmVyL3NtYXJ0LVByYWN0aXRpb25lci03MTQ4MjcxMyIsImlhdCI6MTU1OTEzODkxMywiZXhwIjoxNTkwNjc0OTE0fQ.-Ey7wdFSlmfoQrm7HNxAgJQBJPKdtfH7kL1Z91L60_8",
                    "token_type": "bearer",
                    "scope": "openid fhirUser offline_access user/*.* patient/*.* launch/encounter launch/patient profile",
                    "client_id": "my_web_app",
                    "expires_in": 3600,
                    "id_token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJwcm9maWxlIjoiUHJhY3RpdGlvbmVyL3NtYXJ0LVByYWN0aXRpb25lci03MTQ4MjcxMyIsImZoaXJVc2VyIjoiUHJhY3RpdGlvbmVyL3NtYXJ0LVByYWN0aXRpb25lci03MTQ4MjcxMyIsImF1ZCI6Im15X3dlYl9hcHAiLCJzdWIiOiJkYjIzZDBkZTI1Njc4ZTY3MDk5YmM0MzQzMjNkYzBkOTY1MTNiNTUyMmQ0Yjc0MWNiYTM5ZjdjOTJkMGM0NmFlIiwiaXNzIjoiaHR0cDovL2xhdW5jaC5zbWFydGhlYWx0aGl0Lm9yZyIsImlhdCI6MTU1OTEzODkxNCwiZXhwIjoxNTU5MTQyNTE0fQ.OtbIcs5nyEKaD2kAPasm1DYFixHvVbkC1wQys3oa3T-4Tf8wxW56hzUK0ZQeOK_gEIxiSFn9tLoUvKau_M1WRVD11FPyulvs1Q8EbG5PQ83MBudcpZQJ_uuFbVcGsDMy2xEa_8jAHkHPAVNjj8FRsQCRZC0Hfg0NbXli3yOhAFK1LqTUcrnjfwD-sak0UGQS1H6OgILnTYLrlTTIonfnWRdpWJjjIh3_GCk5k-8LU8AARaPcSE3ZhezoKTSfwQn1XO101g5h337pZleaIlFlhxPRFSKtpXz7BEezkUi5CJqN4d2qNoBK9kapljFYEVdPjRqaBnt4blmyFRXjhdMNwA",
                    "access_token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJuZWVkX3BhdGllbnRfYmFubmVyIjp0cnVlLCJzbWFydF9zdHlsZV91cmwiOiJodHRwczovL2xhdW5jaC5zbWFydGhlYWx0aGl0Lm9yZy9zbWFydC1zdHlsZS5qc29uIiwicGF0aWVudCI6ImIyNTM2ZGQzLWJjY2QtNGQyMi04MzU1LWFiMjBhY2RmMjQwYiIsImVuY291bnRlciI6ImUzZWMyZDE1LTRjMjctNDYwNy1hNDVjLTJmODQ5NjJiMDcwMCIsInJlZnJlc2hfdG9rZW4iOiJleUowZVhBaU9pSktWMVFpTENKaGJHY2lPaUpJVXpJMU5pSjkuZXlKamIyNTBaWGgwSWpwN0ltNWxaV1JmY0dGMGFXVnVkRjlpWVc1dVpYSWlPblJ5ZFdVc0luTnRZWEowWDNOMGVXeGxYM1Z5YkNJNkltaDBkSEJ6T2k4dmJHRjFibU5vTG5OdFlYSjBhR1ZoYkhSb2FYUXViM0puTDNOdFlYSjBMWE4wZVd4bExtcHpiMjRpTENKd1lYUnBaVzUwSWpvaVlqSTFNelprWkRNdFltTmpaQzAwWkRJeUxUZ3pOVFV0WVdJeU1HRmpaR1l5TkRCaUlpd2laVzVqYjNWdWRHVnlJam9pWlRObFl6SmtNVFV0TkdNeU55MDBOakEzTFdFME5XTXRNbVk0TkRrMk1tSXdOekF3SW4wc0ltTnNhV1Z1ZEY5cFpDSTZJbTE1WDNkbFlsOWhjSEFpTENKelkyOXdaU0k2SW05d1pXNXBaQ0JtYUdseVZYTmxjaUJ2Wm1ac2FXNWxYMkZqWTJWemN5QjFjMlZ5THlvdUtpQndZWFJwWlc1MEx5b3VLaUJzWVhWdVkyZ3ZaVzVqYjNWdWRHVnlJR3hoZFc1amFDOXdZWFJwWlc1MElIQnliMlpwYkdVaUxDSjFjMlZ5SWpvaVVISmhZM1JwZEdsdmJtVnlMM050WVhKMExWQnlZV04wYVhScGIyNWxjaTAzTVRRNE1qY3hNeUlzSW1saGRDSTZNVFUxT1RFek9Ea3hNeXdpWlhod0lqb3hOVGt3TmpjME9URTBmUS4tRXk3d2RGU2xtZm9Rcm03SE54QWdKUUJKUEtkdGZIN2tMMVo5MUw2MF84IiwidG9rZW5fdHlwZSI6ImJlYXJlciIsInNjb3BlIjoib3BlbmlkIGZoaXJVc2VyIG9mZmxpbmVfYWNjZXNzIHVzZXIvKi4qIHBhdGllbnQvKi4qIGxhdW5jaC9lbmNvdW50ZXIgbGF1bmNoL3BhdGllbnQgcHJvZmlsZSIsImNsaWVudF9pZCI6Im15X3dlYl9hcHAiLCJleHBpcmVzX2luIjozNjAwLCJpZF90b2tlbiI6ImV5SjBlWEFpT2lKS1YxUWlMQ0poYkdjaU9pSlNVekkxTmlKOS5leUp3Y205bWFXeGxJam9pVUhKaFkzUnBkR2x2Ym1WeUwzTnRZWEowTFZCeVlXTjBhWFJwYjI1bGNpMDNNVFE0TWpjeE15SXNJbVpvYVhKVmMyVnlJam9pVUhKaFkzUnBkR2x2Ym1WeUwzTnRZWEowTFZCeVlXTjBhWFJwYjI1bGNpMDNNVFE0TWpjeE15SXNJbUYxWkNJNkltMTVYM2RsWWw5aGNIQWlMQ0p6ZFdJaU9pSmtZakl6WkRCa1pUSTFOamM0WlRZM01EazVZbU0wTXpRek1qTmtZekJrT1RZMU1UTmlOVFV5TW1RMFlqYzBNV05pWVRNNVpqZGpPVEprTUdNME5tRmxJaXdpYVhOeklqb2lhSFIwY0RvdkwyeGhkVzVqYUM1emJXRnlkR2hsWVd4MGFHbDBMbTl5WnlJc0ltbGhkQ0k2TVRVMU9URXpPRGt4TkN3aVpYaHdJam94TlRVNU1UUXlOVEUwZlEuT3RiSWNzNW55RUthRDJrQVBhc20xRFlGaXhIdlZia0Mxd1F5czNvYTNULTRUZjh3eFc1Nmh6VUswWlFlT0tfZ0VJeGlTRm45dExvVXZLYXVfTTFXUlZEMTFGUHl1bHZzMVE4RWJHNVBRODNNQnVkY3BaUUpfdXVGYlZjR3NETXkyeEVhXzhqQUhrSFBBVk5qajhGUnNRQ1JaQzBIZmcwTmJYbGkzeU9oQUZLMUxxVFVjcm5qZndELXNhazBVR1FTMUg2T2dJTG5UWUxybFRUSW9uZm5XUmRwV0pqakloM19HQ2s1ay04TFU4QUFSYVBjU0UzWmhlem9LVFNmd1FuMVhPMTAxZzVoMzM3cFpsZWFJbEZsaHhQUkZTS3RwWHo3QkVlemtVaTVDSnFONGQycU5vQks5a2FwbGpGWUVWZFBqUnFhQm50NGJsbXlGUlhqaGRNTndBIiwiaWF0IjoxNTU5MTM4OTE0LCJleHAiOjE1NTkxNDI1MTR9.lhfmhXYfoaI4QcJYvFnr2FMn_RHO8aXSzzkXzwNpc7w",
                    "code": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJjb250ZXh0Ijp7Im5lZWRfcGF0aWVudF9iYW5uZXIiOnRydWUsInNtYXJ0X3N0eWxlX3VybCI6Imh0dHBzOi8vbGF1bmNoLnNtYXJ0aGVhbHRoaXQub3JnL3NtYXJ0LXN0eWxlLmpzb24iLCJwYXRpZW50IjoiYjI1MzZkZDMtYmNjZC00ZDIyLTgzNTUtYWIyMGFjZGYyNDBiIiwiZW5jb3VudGVyIjoiZTNlYzJkMTUtNGMyNy00NjA3LWE0NWMtMmY4NDk2MmIwNzAwIn0sImNsaWVudF9pZCI6Im15X3dlYl9hcHAiLCJzY29wZSI6Im9wZW5pZCBmaGlyVXNlciBvZmZsaW5lX2FjY2VzcyB1c2VyLyouKiBwYXRpZW50LyouKiBsYXVuY2gvZW5jb3VudGVyIGxhdW5jaC9wYXRpZW50IHByb2ZpbGUiLCJ1c2VyIjoiUHJhY3RpdGlvbmVyL3NtYXJ0LVByYWN0aXRpb25lci03MTQ4MjcxMyIsImlhdCI6MTU1OTEzODkxMywiZXhwIjoxNTU5MTM5MjEzfQ.G2dLcSnjpwM_joWTxWLfL48vhdlj3zGV9Os5cKREYcY"
                }
            });

            const env = new BrowserEnv();

            let client = await new Promise((resolve, reject) => {
                env.redirect("http://localhost/?launch=123&state=" + key);

                env.once("redirect", async () => {
                    env.redirect("http://localhost/?code=123&state=" + env.getUrl().searchParams.get("state"));
                    smart.init(env, {
                        client_id : "my_web_app",
                        scope     : "launch/patient",
                        iss       : mockUrl
                    }).then(resolve).catch(reject);
                });

                // This first call will NEVER resolve, but it will
                // trigger a "redirect" event
                smart.init(env, {
                    client_id : "my_web_app",
                    scope     : "launch/patient",
                    iss       : mockUrl
                }).catch(reject);
            });

            expect(client.getPatientId()).to.equal("b2536dd3-bccd-4d22-8355-ab20acdf240b");
            expect(client.getEncounterId()).to.equal("e3ec2d15-4c27-4607-a45c-2f84962b0700");
            expect(client.getUserId()).to.equal("smart-Practitioner-71482713");
            expect(client.getUserType()).to.equal("Practitioner");

            // Now rey once again to test the page refresh flow
            env.redirect("http://localhost/?code=123");
            client = await smart.init(env, {
                client_id : "my_web_app",
                scope     : "launch/patient",
                iss       : mockUrl
            });

            expect(client.getPatientId()).to.equal("b2536dd3-bccd-4d22-8355-ab20acdf240b");
            expect(client.getEncounterId()).to.equal("e3ec2d15-4c27-4607-a45c-2f84962b0700");
            expect(client.getUserId()).to.equal("smart-Practitioner-71482713");
            expect(client.getUserType()).to.equal("Practitioner");
        });
    });
});
