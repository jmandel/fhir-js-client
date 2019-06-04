SMART on FHIR JavaScript Library
================================

This is a JavaScript library for connecting SMART apps to Fhir servers.
It works both in browsers (IE10+) and on the server (NodeJS).

> This the documentation for the new version. If you want to migrate from older versions, make sure you check out [what's new in v2](http://docs.smarthealthit.org/client-js/v2.html). For older versions see http://docs.smarthealthit.org/client-js/index.html

## Installation

Install from npm:
```sh
# This is still in beta! To give it a try do:
npm i fhirclient@dev

# To install the older version do:
npm i fhirclient
```
## Browser Usage

In the browser you need to include the library via script tag. You typically
have to create two separate pages that correspond the your
`launch_uri` (Launch Page) and `redirect_uri` (Index Page).

**Launch Page**
```html
<!-- launch.html -->
<script src="/path/to/fhir-client.js"></script>
<script>
FHIR.oauth2.authorize({
    "client_id": "my_web_app",
    "scope"    : "launch patient/*.read online_access openid fhirUser"
});
</script>
```

**Index Page**
```html
<!-- index.html -->
<script src="/path/to/fhir-client.js"></script>
<script>
FHIR.oauth2.ready()
    .then(client => client.request("Patient"))
    .then(console.log)
    .catch(console.error);
</script>
```

## Server Usage (experimental)
The server is fundamentally different environment than the browser but the
API is very similar. Here is a simple express example:
```js
const fhirClient = require("fhirclient");

// This is what the EHR will call
app.get("/launch", (req, res) => {
    fhirClient(req, res).authorize({
        "client_id": "my_web_app",
        "scope"    : "launch patient/*.read online_access openid fhirUser"
    });
});

// This is what the Auth server will redirect to
app.get("/", (req, res) => {
    fhirClient(req, res).ready()
        .then(client => client.request("Patient"))
        .then(res.json)
        .catch(res.json);
});

```

## API
Imagine that there is an object called "smart" that exposes the SMART-specific
methods. In the browser that is automatically created and is available at
`window.FHIR.oauth2`. On the server the library exports a function that you call
with your http request and response and it will create that "smart" object for you:

```js
// BROWSER
const smart = FHIR.oauth2;

// SERVER
const smart = fhirClient(request, response);
```
Once you have obtained that "smart" object, the API that it exposes is exactly
the same for the browser and the server.

### `authorize(options): Promise<never>`
Starts the [SMART Launch Sequence](http://hl7.org/fhir/smart-app-launch/#smart-launch-sequence).

> **IMPORTANT:** `authorize()` will end up redirecting you to the authorization server. This means that you should **not** add anything to the returned promise chain. Any code written directly after the `authorize()` call might not be executed due to that redirect!

The options that you would typically pass for an EHR launch are just `clientId`
and `scope`. For standalone launch you should also provide the `iss` option.
Here is the full list of options:

#### Common Options

|Name        |Type      |Description
|------------|----------|-----------
|clientId    |`String`  | The `client_id` that you have obtained while registering your app in the EHR. This is not required if you only intend to communicate with open FHIR servers. **Note:** For backwards compatibility reasons we also accept `client_id` instead of `clientId`!
|scope       |`String`  | One or more space-separated scopes that you would like to request from the EHR. [Learn more](http://hl7.org/fhir/smart-app-launch/scopes-and-launch-context/index.html)
|clientSecret|`String`  | If you have registered a confidential client, you should pass your `clientSecret` here. **Note: ONLY use this on the server**, as the browsers are considered incapable of keeping a secret. 
|iss         |`String`  | This is the URL of the service you are connecting to. For [EHR Launch](http://hl7.org/fhir/smart-app-launch/#ehr-launch-sequence) you **MUST NOT** provide this option. It will be passed by the EHR as url parameter instead. Using `iss` as an option will "lock" your app to that service provider. In other words, passing an `iss` option is how you do [Standalone Launch](http://hl7.org/fhir/smart-app-launch/#standalone-launch-sequence).
|redirectUri |`String`  | Where to redirect to after successful authorization. Defaults to the root (the index) of the current directory. **Note:** For backwards compatibility reasons we also accept `redirect_uri` instead of `redirectUri`!

#### Advanced Options
These should **ONLY** be used in development.

|Name             |Type      | Description
|-----------------|----------|-----------
|fhirServiceUrl   |`String`  | The base URL of the FHIR server to use. This is just like the `iss` option, except that it is designed to bypass the authentication. If `fhirServiceUrl` is passed, the `authorize` function will not actually attempt to authorize. It will skip that and redirect you to your `redirect_uri`.
|patientId        |`String`  | The ID of the selected patient. If you are launching against an open FHIR server, there is no way to obtain the launch context that would include the selected patient ID. This way you can "inject" that ID and make the client behave as if this is the currently active patient.
|encounterId      |`String`  | The ID of the selected encounter. If you are launching against an open FHIR server, there is no way to obtain the launch context that would (in some EHRs) include the selected encounter ID. This way you can "inject" that ID and make the client behave as if this is the currently active encounter.
|launch           |`String`  | The launch identifier that is typically provided by the launching EHR as `launch` url parameter. In development it is sometimes useful to be able to pass this as an option. For example, this could allow you to simulate launches from you tests.
|fakeTokenResponse|`Object`  | Useful for testing. This object can contain any properties that are typically contained in an [access token response](http://hl7.org/fhir/smart-app-launch/#step-3-app-exchanges-authorization-code-for-access-token). These properties will be stored into the client state, making it "believe" that it has been authorized.

### `ready([onSuccess [, onError]]): Promise<Client>`
This should be called on your `redirect_uri`. Returns a Promise that will eventually be resolved with a Client instance that you can use to query the fhir server.

> The `onSuccess` and `onError` callback functions are optional (and **deprecated**). We only accept them to keep the library compatible with older apps. If these functions are provided, they will simply be attached to the returned promise chain.

### `init(options): Promise<Client>`
This function can be used when you want to handle everything in one page (no launch endpoint needed). You can think of it as if it does:
```js
authorize(options).then(ready)
```
**options** is the same object you pass to the `authorize` method.

Example:
```js
FHIR.oauth2.init({
    client_id: "my_web_app",
    scope    : "patient/*.read"
}).then(client => /* initialize my app */);
```
**Be careful with `init()`!** There are some details you need to be aware of:
1. It will only work if your `launch_uri` is the same as your `redirect_uri`.
   While this should be valid, we can't promise that every EHR will allow you
   to register client with such settings.
2. Internally, init() will be called twice. First it will redirect to the EHR,
   then the EHR will redirect back to the page where `init()` will be called
   again to complete the authorization. This is generally fine, because the
   returned promise will only be resolved once, after the second execution,
   but please also consider the following:
   - You should wrap all your app's code in a function that is only executed
     after init() resolves!
   - Since the page will be loaded twice, you must be careful if your code has
     global side effects that can persist between page reloads (for example
     writing to localStorage).
   

### `Client`
This is a FHIR client that is returned to you from the `ready()` call. You can also create it yourself if needed:
```js
// BROWSER
const client = FHIR.client({
    serverUrl: "https:r4.smarthealthit.org"
});

// SERVER
const client = fhirClient(req, res).client({
    serverUrl: "https:r4.smarthealthit.org"
});
```
It exposes the following API:

<!--
#### `client.getPatientId()`
#### `client.getEncounterId()`
#### `client.getIdToken()`
#### `client.getFhirUser()`
#### `client.getUserId()`
#### `client.getUserType()`
-->
#### client.`request(requestUriOrOptions[, fhirOptions]): Promise<Object>`
This is the single most important method. Please see the [live examples](http://docs.smarthealthit.org/client-js/request.html).

**requestUriOrOptions** can be a `String` URL, or an `URL instance` or an object having an `url` property. The `url` can be relative path that will be appended to your base URL. Using a full http URL will also work, as long as it is on the same domain as your base URL. Any other option will be passed to the underlying `fetch()` call.

**fhirOptions: Object** can contain the following options:

| Name    | Type   | Description
|---------|--------|------------
|pageLimit|`Number`| When you request a Bundle, the result will typically come back in pages and you will only get the first page. You can set this to number bigger than `1` to request multiple pages. For example `pageLimit: 3` will give you the first 3 pages as array. To fetch all the available pages you can set this to `0`. **Defaults to `1`**. Ignored if the response is not a `Bundle`.
|onPage|`Function`| When you fetch multiple pages the result array might be huge. That could take a lot of time and memory. It is often better if you specify a page callback instead. The `onPage` callback will be called once for each page with the page Bundle as it's argument. If you use `resolveReferences` and `graph: false`, the references will be passed to `onPage` as second argument.<ul><li>If `onPage` returns a promise it will be awaited for, meaning that no more pages will be fetched until the `onPage` promise is resolved.</li><li>If `onPage` returns a rejected promise or throws an error, the client will not continue fetching more pages.</li><li>If you use an `onPage` callback options the promise returned by `request()` will be resolved with `null`. This is to avoid building that huge array in memory. By using the `onPage` option you are stating that you will handle the result one page at a time, instead of expecting to receive big combined result.</li></ul>
|graph|`Boolean`| Only relevant if you use `resolveReferences`. If `false`, the resolved references will not be "mounted" in the result tree, but will be returned as separate map object instead. **Defaults to `true`**.
|resolveReferences|`String or String[]`| One or more references to resolve. Single item can be specified as a string or as an array of one string. Multiple items must be specified as array. * Each item is a dot-separated path to the desired reference within the result object, excluding the "reference" property. For example `context.serviceProvider` will look for `{Response}.context.serviceProvider.reference`. * This is recursive so the order does matter. For example `["context", "context.serviceProvider"]` will work properly and first resolve the `context` reference, then it's `serviceProvider` reference. However, if you flip the order "context.serviceProvider" will fail because "context" is not resolved yet. * This option does not work with contained references (they are already "resolved" anyway).
|useRefreshToken|`Boolean`| **Defaults to `true`**. If the client is authorized, it will possess an access token and pass it with the requests it makes. When that token expires, you should get back a `401 Unauthorized` response. When that happens, if the client also has a refresh token and if `useRefreshToken` is `true` (default), the client will attempt to automatically re-authorize itself and then it will re-run the failed request and eventually resolve it's promise with the final result. This means that your requests should never fail with `401`, unless the refresh token is also expired. If you don't want this, you can set `useRefreshToken` to `false`. There is a `refresh` method on the client that can be called manually to renew the access token.

***Examples:***

**Fetch single resource**
```js
client.request("Patient/id"); // Resolves with a Patient or rejects with an Error
```

**Fetch the current patient**
```js
client.request(`Patient/${client.patient.id}`); // Resolves with a Patient or rejects with an Error
```

**Fetch a bundle**
```js
client.request("Patient"); // Resolves with a Bundle or rejects with an Error
```

**Get all pages**
```js
client.request("Patient", { pageLimit: 0 });  // Resolves with array of Bundles or rejects with an Error
```

**Handle pages as they arrive**
```js
// Resolves with null or rejects with an Error
client.request("Patient", {
    pageLimit: 5,
    onPage(bundle) {
        // do something with the downloaded page
    }
});
```

**Resolve References**
```js
// Resolves with augmented Encounter or rejects with an Error
client.request(
    "Encounter/518a522a-4b10-47db-9daf-53b726d32607",
    resolveReferences: [ "serviceProvider" ]
);
```

**Extracting multiple related resources from single Observation:**
```js
// Resolves with Object (augmented Observation) or rejects with an Error
client.request(
    "Observation/smart-691-bmi",
    resolveReferences: [
        "context",                 // The Encounter
        "context.serviceProvider", // The Organization (hospital)
        "performer.0",             // The Practitioner
        "subject"                  // The Patient
    ]
);
```

**Getting the references as separate object**

Resolved references are "mounted" on the result tree, replacing
the value of the original reference property. If you don't want that behavior,
you can set the `graph` option of the `request` method to false. In this case,
the promise will be resolved with an object having two properties:
- `data` the original response data
- `references` a map of resolved references
```js
// Resolves with Object ({ data, references }) or rejects with an Error
client.request(
    "Encounter/518a522a-4b10-47db-9daf-53b726d32607",
    resolveReferences: [ "serviceProvider" ],
    graph: false
);
```

#### client.`refresh(): Promise<Object>`
Use the refresh token to obtain new access token. If the refresh token is
expired (or this fails for any other reason) it will be deleted from the
state, so that we don't enter into loops trying to re-authorize.

> Note that that `client.request()` will automatically refresh the access token
for you!

Resolves with the updated state or rejects with an error.

#### client.`api: Object`
Only accessible if fhir.js is available. Read more about the fhir.js integration here.

#### client.`patient.id: String|null`
The selected patient ID or `null` if patient is not available. If no patient is selected, it will generate useful debug messages about the possible reasons. See [debugging](#Debugging).

#### client.`patient.read(): Promise<Object>`
Fetches the selected patient resource (if available). Resolves with the patient or rejects with an error.

#### client.`patient.api: Object`
Only accessible if fhir.js is available. Read more about the fhir.js integration here.

#### client.`encounter.id: String|null`
The selected encounter ID or `null` if encounter is not available. If no encounter is selected, it will generate useful debug messages about the possible reasons. See debugging.

#### client.`encounter.read(): Promise<Object>`
Fetches the selected encounter resource (if available). Resolves with the encounter or rejects with an error.

#### client.`user.id: String`
The selected user ID or `null` if user is not available. If no user is selected, it will generate useful debug messages about the possible reasons. See [debugging](#Debugging).

#### client.`user.fhirUser: String`
The selected user identifier that looks like `Practitioner/id` or `null` if user is not available. If no user is selected, it will generate useful debug messages about the possible reasons. See [debugging](#Debugging).

#### client.`user.resourceType: String`
The selected user resourceType (E.g. `Practitioner`, `Patient`, `RelatedPerson`...) or `null` if user is not available. If no user is selected, it will generate useful debug messages about the possible reasons. See [debugging](#Debugging).

#### client.`user.read(): Promise<Object>`
Fetches the selected user resource (if available). Resolves with the user or rejects with an error. 

---

Finally, there are some **utility methods**, mostly inherited by older versions of the library:
#### client.`byCode(observations, property): Object`
Groups the observations by code. Returns a map that will look like:
```js
const map = client.byCodes(observations, "code");
// map = {
//     "55284-4": [ observation1, observation2 ],
//     "6082-2": [ observation3 ]
// }
```

#### client.`byCodes(observations, property): Function`
Similar to `byCode` but builds the map internally and returns a filter function
that will produce flat arrays. For example:
```js
const filter = client.byCodes(observations, "category");
filter("laboratory") // => [ observation1, observation2 ]
filter("vital-signs") // => [ observation3 ]
filter("laboratory", "vital-signs") // => [ observation1, observation2, observation3 ]
```

#### client.units.`cm({ code, value }): Number`
Converts the `value` to `code`, where `code` can be `cm`, `m`, `in`, `[in_us]`, `[in_i]`, `ft`, `[ft_us]`

#### client.units.`kg({ code, value }): Number`
Converts the `value` to `code`, where `code` can be `kg`, `g`, string containing `lb`, string containing `oz`

#### client.units.`any({ code, value }): Number`
Just asserts that `value` is a number and then returns that value

#### client.`getPath(object, path): any`
Given an object (or array), tries to walk down to the given dot-separated path
and returns the value. It will return `undefined` if the path cannot find any property. It will NOT throw if an intermediate property does not exist.
The path is dot-separated even for arrays! Examples:
```js
const data = { a: { b: "x" }, c: [ 2, { x: 5}, [1,2,3] ]};
client.getPath(data, "") // => data
client.getPath(data, "a") // => { b: "x" }
client.getPath(data, "a.b") // => "x"
client.getPath(data, "c.1.x") // => 5
client.getPath(data, "c.2.1") // => 2
client.getPath(data, "a.b.c.d.e") // => undefined
```

## Fhir.js Integration
Since v2.0.0 this library no longer includes fhir.js. That architecture was extremely difficult to maintain. Fhir.js is now an optional dependency, meaning that it is not available by default, unless you include it in the page. Our goal is to provide simple
alternative to fhir.js - most of it should be possible via `client.request`. Please see the [Examples](http://docs.smarthealthit.org/client-js/fhirjs-equivalents)

#### Reasons to use fhir.js
1. If you have old apps using legacy API like `client.api.anyFhirJsMethod()` or `client.patient.api.anyFhirJsMethod()`
2. If you prefer the mongodb-like query syntax.
3. If you are trying to do something specific that can only be done with fhir.js 

#### Reasons not to use fhir.js
1. If you prefer to build the fhir queries yourself using fhir syntax.
2. If you encounter fhir-version-specific issues with fhir.js
3. If you want to keep things simpler and smaller

#### Browser Integration
You just need to include fhir.js (`nativeFhir.js`) in the page via script tag. We will detect that and make the necessary linking. You can then use it via `client.api` and `client.patient.api`, just like it used to work with older versions of this library. For convenience we have included the latest build of fhir.js that we have tested with at [lib/nativeFhir.js](lib/nativeFhir.js).
```html
<!-- index.html -->
<script src="/path/to/nativeFhir.js"></script>
<script src="/path/to/fhir-client.js"></script>
<script>
FHIR.oauth2.ready().then(client => client.api.search({ type: "Patient" }))
</script>
```


#### NodeJS Integration
There are no global variables to detect so you'll have to link it manually using
the dedicated `connect(fhirJs)` method of the client:
```js
const fhirJs = require("fhir.js");

// Inside a route handler
app.get("/", async (req, res) => {
    const client = await fhirClient(req, res).ready();
    client.connect(fhirJs);
    client.api.search({ type: "Patient" }).then(res.json).catch(res.json);
});
```

## Contributing and Development

### NPM Scripts

After you `cd` into to the project folder and run `npm i`, you can use npm scripts to handle any project-related task:

```sh
# run tests
npm test

# Build everything
npm run build

# Only build minified scripts for production
npm run pack:prod

# Only build non-minified scripts for development
npm run pack:dev

# Only build non-minified scripts for development and watch them for changes
npm run build:dev

# Starts a server to host examples locally
npm run examples

# Deploy documentation to github pages
npm run deploy:gh
```

After building, the following files will be generated:

* `build/fhir-client.js`         - The browser bundle for development
* `build/fhir-client.min.js`     - The browser bundle for production
* `build/fhir-client.js.map`     - Hidden source map 
* `build/fhir-client.min.js.map` - Hidden source map
* `build/report.html`            - Graphical visualization of the dev bundle

### Debugging
This library uses the [debug](https://www.npmjs.com/package/debug) module. To enable
debug logging in Node use the `DEBUG` env variable. In the browser execute this in the console:
```js
localStorage.debug = 'FHIRClient:*'
```
and reload the page.


<!-- - http://docs.smarthealthit.org/client-js/index.html
- http://docs.smarthealthit.org/client-js/api.html -->
<!-- - http://docs.smarthealthit.org/client-js/request.html -->
<!-- - http://docs.smarthealthit.org/clients/javascript/ -->

