
SMART on FHIR JavaScript Library
================================

This is a JavaScript library for connecting SMART apps to FHIR servers.
It works both in browsers (IE10+) and on the server (NodeJS).


> This is the documentation for version 2.0.0.+. If you want to migrate from older versions, make sure you check out **[what's new in v2](http://docs.smarthealthit.org/client-js/v2.html)**. For older versions see [http://docs.smarthealthit.org/clients/javascript/](http://docs.smarthealthit.org/clients/javascript/).


[![CircleCI](https://circleci.com/gh/smart-on-fhir/client-js/tree/master.svg?style=svg)](https://circleci.com/gh/smart-on-fhir/client-js/tree/master) [![Coverage Status](https://coveralls.io/repos/github/smart-on-fhir/client-js/badge.svg?branch=master)](https://coveralls.io/github/smart-on-fhir/client-js?branch=master) [![npm version](https://badge.fury.io/js/fhirclient.svg)](https://badge.fury.io/js/fhirclient)

## Table of Contents
---
- [Installation](#installation)
- [Browser Usage](#browser-usage)
    - [Live Examples](https://35u09.codesandbox.io/)
    - [Live Examples Code](https://codesandbox.io/s/fhir-client-browser-examples-35u09)
- [Server Usage](#server-usage)
    - [NodeJS API Details](node.md)
    - [Express Example](https://codesandbox.io/s/jovial-dew-c0che)
    - [Native Example](https://codesandbox.io/s/brave-wildflower-q4mhq)
    - [HAPI Example](https://codesandbox.io/s/fhir-client-hapi-myq5q)
    - [Express + fhir.js Example](https://codesandbox.io/s/fhir-client-express-and-fhirjs-4t1mp)
- [SMART API](#smart-api)
    - [Full Documentation](api.md)
- [Client API](#client)
    - [Full Documentation](client.md)
    - [Request examples](http://docs.smarthealthit.org/client-js/request.html)
- [Integration with Fhir.js](#fhirjs-integration)
    - [Example fhir.js methods and analog request calls](fhirjs-equivalents.md)
- [Contributing and Development](#contributing-and-development)
- [Debugging](#debugging)

<br/><br/>


## Installation

Install from npm:
```sh
# This is still in beta! To give it a try do:
npm i https://github.com/smart-on-fhir/client-js

# To install the older version do:
npm i fhirclient
```
## Browser Usage

In the browser you need to include the library via script tag. You typically
have to create two separate pages that correspond to your
`launch_uri` (Launch Page) and `redirect_uri` (Index Page).

**Launch Page**
```html
<!-- launch.html -->
<script src="/path/to/fhir-client.js"></script>
<script>
FHIR.oauth2.authorize({
    "client_id": "my_web_app",
    "scope": "patient/*.read"
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

## Server Usage
The server is fundamentally different environment than the browser but the
API is very similar. Here is a simple Express example:
```js
const fhirClient = require("fhirclient");

// This is what the EHR will call
app.get("/launch", (req, res) => {
    fhirClient(req, res).authorize({
        "client_id": "my_web_app",
        "scope": "patient/*.read"
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
Read more at the [NodeJS API Details](node).

## SMART API
Imagine that there is an object called "smart" that exposes the SMART-specific
methods. In the browser that is automatically created and is available at
`window.FHIR.oauth2`. On the server the library exports a function that you call
with your http request and response and it will create that "smart" object for you:

```js
// BROWSER
const smart = FHIR.oauth2;
smart.authorize(options);

// SERVER
const smart = require("fhirclient");
smart(request, response).authorize(options);
```
Once you have obtained that "smart" object, the API that it exposes is exactly
the same for the browser and the server.

Read the [SMART API Documentation](api)


   

## Client
This is a FHIR client that is returned to you from the `ready()` or the `init()`
SMART API calls. You can also create it yourself if needed. For example, there
is no need to authorize against an open FHIR server. You can skip that and start
by creating a client instance:
```js
// BROWSER
const client = FHIR.client({
    serverUrl: "https://r4.smarthealthit.org"
});

// SERVER
const client = fhirClient(req, res).client({
    serverUrl: "https://r4.smarthealthit.org"
});
```

The client instance exposes a super-powered `request` method that you use to query
the FHIR server and a bunch of other useful utilities and methods.
[Read the full Client API docs](client).


## Fhir.js Integration
Since v2.0.0 this library no longer includes fhir.js. That architecture was
extremely difficult to maintain. Fhir.js is now an optional dependency, meaning
that it is not available by default, unless you include it in the page.
Our goal is to provide a simple alternative to fhir.js - most of it should be
possible via `client.request`. Please see the [Examples](fhirjs-equivalents).

#### Reasons to use fhir.js
1. If you have old apps using legacy API like `client.api.anyFhirJsMethod()` or `client.patient.api.anyFhirJsMethod()`
2. If you prefer the mongodb-like query syntax.
3. If you are trying to do something specific that can only be done with fhir.js 

#### Reasons not to use fhir.js
1. If you prefer to build the fhir queries yourself using fhir syntax.
2. If you encounter fhir-version-specific issues with fhir.js
3. If you want to keep things simpler and smaller

#### Browser Integration
You just need to include fhir.js (`nativeFhir.js`) in the page via script tag.
We will detect that and make the necessary linking. You can then use it via
`client.api` and `client.patient.api`, just like it used to work with older
versions of this library. The latest build of fhir.js that we have tested with
is available at [lib/nativeFhir.js](https://github.com/smart-on-fhir/client-js/blob/master/lib/nativeFhir.js).
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
    const client = await smart(req, res).ready();
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
```

After building, the following files will be generated:

* `build/fhir-client.js`         - The browser bundle for development
* `build/fhir-client.min.js`     - The browser bundle for production
* `build/fhir-client.js.map`     - Hidden source map 
* `build/fhir-client.min.js.map` - Hidden source map
* `build/report.html`            - Graphical visualization of the dev bundle

## Debugging
This library uses the [debug](https://www.npmjs.com/package/debug) module. To enable
debug logging in Node use the `DEBUG` env variable. In the browser execute this in the console:
```js
localStorage.debug = 'FHIRClient:*'
```
and then reload the page.


