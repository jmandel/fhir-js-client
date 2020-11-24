# Working with open servers

This library is designed to be used in SMART apps (and not just FHIR apps). This implies that the server is protected and uses SMART for launch and authentication. However, in some cases (mostly for testing and development) it is also useful to connect to open servers. There are several major differences between "open" and "protected" FHIR servers:

1. Open servers do not require authentication
2. Open servers do not support SMART, thus they cannot provide you with launch context. There is no current patient, user or encounter. The app is free to choose what to access.
3. In open servers, the app has full access which cannot be restricted with scopes.
4. It is not possible to make an EHR launch against an open server.

## Working with open servers only
If you are working on an app that is ONLY going to connect to an open server, then please ignore the SMART part of the documentation. You don't need to authorize. All you need is to create a client instance like so:
```js
const client = FHIR.client("http://hapi.fhir.org/baseDstu3");
```
Then use the `client instance to make requests as usual.

Note that unlike a SMART launched app, this one has no concept of "current" patient, user or encounter. This means that SMART-specific APIs will not work:
- `client.patient.id` will be `null`
- `client.patient.read()` and `client.patient.request()` will reject with a "Patient is not available" error.

- `client.user.id`, `client.user.fhirUser` and `client.user.resourceType` will be `null`
- `client.user.read()` will reject with a "User is not available" error.

- `client.encounter.id` will be `null`
- `client.encounter.read()` will reject with a "Encounter is not available" error.

If the app is designed for open servers, it should simply avoid using that API. However, in rare cases one could be tempted to use `client.patient.read()` instead of `client.request()`. To do so, we can manually set the "selected patient" like so:

```js
const client = FHIR.client({
    serverUrl: "http://hapi.fhir.org/baseDstu4",
    tokenResponse: {
        patient: '1234'
    }
});
```
In this way you pre-select the patient and `client.patient.id` would return `'1234'` and `client.patient.read()` should work as usual.

## Working with both open and protected servers
Ideally, an app should be capable of working with both protected and open servers. However, this may not always be possible out of the box. For example if the app relies on EHR launch and uses context APIs like `client.patient...` or `client.user...`, then the developer assumes that the launch context must be available.

In real life, developers often design their apps as SMART apps, but also want to be able to launch them against open servers for testing purposes. There are several way to achieve that:

### Using multiple launch files
If the app is designed for EHR launch, the typical approach is to have separate locations for your launch_uri and redirect_uri. For example, you may have a `launch.html` file where you call `FHIR.oauth2.authorize({...});` and an `index.html` file where uou call `FHIR.oauth2.ready();` and initialize your app. To support multiple environments you can have multiple launch files. For example:

*launch_cerner.html*
```html
<!DOCTYPE html>
<html>
 <head>
     <title>Launch From Cerner</title>
     <script src="dist/build/fhir-client.js"></script>
     
 </head>
 <body>
    <h3>Loading...</h3>
    <script type="text/javascript">
        FHIR.oauth2.authorize({
            redirectUri: "./index.html",
            clientId: "my_cerner_client_id",
            scope: "..."
        });
    </script>
 </body>
</html>
```

*launch_epic.html*
```html
<!DOCTYPE html>
<html>
 <head>
     <title>Launch From Epic</title>
     <script src="dist/build/fhir-client.js"></script>
     
 </head>
 <body>
    <h3>Loading...</h3>
    <script type="text/javascript">
        FHIR.oauth2.authorize({
            redirectUri: "./index.html",
            clientId: "my_epic_client_id",
            scope: "..."
        });
    </script>
 </body>
</html>
```

*launch_open.html*
```html
<!DOCTYPE html>
<html>
 <head>
     <title>Launch From Epic</title>
     <script src="dist/build/fhir-client.js"></script>
     
 </head>
 <body>
    <h3>Loading...</h3>
    <script type="text/javascript">
        FHIR.oauth2.authorize({
            fhirServiceUrl: "http://r4.smarthealthit.org",
            redirectUri: "./index.html",
            patientId: "...", // include if you want to emulate selected patient ID
            encounterId: "...", // include if you want to emulate selected encounter ID
            launch: "whatever",
            fakeTokenResponse: { // include if you want to emulate current user
                id_token: "..."
            }
        });
    </script>
 </body>
</html>
```

Using this set up, you can:
- Register your app at Cerner using a `launch_uri` that points to `launch_cerner.html`
- Register your app at Epic using a `launch_uri` that points to `launch_epic.html`
- Open `launch_open.html` in the browser to test against an open server (http://r4.smarthealthit.org)

