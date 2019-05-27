SMART on FHIR JavaScript Client Library
=======================================

## Usage
To start, include the library using a script tag
```html
<script src="/path/to/fhir-client.js"></script>
```
Then you will find a `FHIR` object at your global namespace (`window.FHIR`). That object has two properties - `oauth2` and `client`.

- `FHIR.oauth2` contains methods to help you handle the SMART authorization.
- `FHIR.client` is the FHIR client factory that you can use to create client instances directly.

### `FHIR.oauth2.authorize(options)`
This is typically called from a separate page that must correspond to the `launch_url` that you have registered with the authorization server.
Examples:

**EHR Launch**
```js
// Note: The EHR will call your `launch_url` and pass `iss` and `launch` URL parameters.
FHIR.oauth2.authorize({
    client_id: "my_web_app",
    scope: "patient/*.read"
});
```

**Standalone Launch**
```js
// Note: The options below contain (hard-coded) `server` URL. This means that you
// can load your launch_url yourself and the library will find out how to do the
// authorization.
FHIR.oauth2.authorize({
    client: {
        client_id: "my_web_app",
        scope:  "patient/*.read launch/patient"
    },
    server: "https://launch.smarthealthit.org/v/r3/sim/eyJoIjoiMSIsImoiOiIxIn0/fhir"
});
```

### `FHIR.oauth2.ready(onSuccess, onError)`
After successful authorization the EHR will redirect your browser to your `redirect_url` (which is where your app lives). There, you can call `FHIR.oauth2.ready` to get a FHIR client instance and use it to query the FHIR server.
```js
FHIR.oauth2.ready(client => client.request("Patient"));
```


### Working with open fhir servers
You don't need to authorize against an open server. This means you can skip the
oauth stuff and create a FHIR client directly. 
```js
const client = new FHIR.client("https://r3.smarthealthit.org");
client.request("Patient").then(console.log, console.error);
```

## Documentation
- [Client API](api.md)
- [Live Examples](examples/index.html)
