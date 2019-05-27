## client.request(url, fhirOptions)
## client.request(requestOptions, fhirOptions)

This is the primary function that you can use for almost everything.

### Arguments
- `url` **string** The URL to request. This can be the first argument, or it should be included in the `requestOptions` object if you prefer the second notation. Most of the time it will be a relative path that will be appended to your base URL. Using a full http URL will also work, as long as it is on the same domain as your base URL.
- `requestOptions` **Object** Any options that will be passed to the underlying request function. Crrently this is jQuery.ajax() but we hope to swith to native `fetch` in near future and get rid of the jquery dependancy. This means that you should avoid passing jQuery-specific options here, so that it is easier for you to upgrade in the future. 
- `fhirOptions` **Object**
    - `resolveReferences` **string | string[]** One or more references to resolve. Single item can be specified as a string or as an array with one string. Multiple items must be specified as array.
        - Each item is a dot-separated path to the desired reference within the result object, excluding the "reference" property. For example `context.serviceProvider` will look for `{Response}.context.serviceProvider.reference`.
        - This is recursive so the order does matter. For example `["context", "context.serviceProvider"]` will work properly and first resolve the `context` reference, then it's `serviceProvider` reference. However, if you
        flip the order "context.serviceProvider" will fail because "context" is not resolved yet.
        - This does not work with contained references (yet)
    - `graph` **Boolean** Only relevant if you use `resolveReferences`. If `false`, the resolved references will not be "mounted" in the result tree, but will be returned as separate map object instead. See examples below. Defaults to `true`.
    - `pageLimit` **Number** Ignored if the response is not a `Bundle`. When you request a Bundle, the result will typically come back in pages and you will only get the first page. You can set this to number bigger than `1` to request multiple pages. For example `pageLimit: 3` will give you the first 3 pages as array. To fetch all the available pages you can set this to `0`. Defaults to `1`. See examples below.
    - `onPage` **Function** When you fetch multiple pages the result array might be huge. That could take a lot of time and memory. It is better if you specify a page callback instead. The `onPage` callback will be called once for each page with the page Bundle as it's only argument. If you use `resolveReferences` and `graph: false`, the references will be passed to `onPage` as second argument.
        - If `onPage` returns a promise it will be awaited for.
        - If `onPage` returns a rejected promise ot throws an error, the client will not continue fetching more pages.
        - If you use an `onPage` callback options the promise returned by the `request` call will be resolved with `null`. This is to avoid building that huge array in memory. By using the `onPage` option you are declaring that you will handle the result one page at a time, instead of expecting to receive a "big" combined result.
    - `useRefreshToken` **Boolean** Defaults to `true`. If the client is authorized, it will posess an access token and pass it with the requests it makes. When that token expires, you should get back a `401 Unauthorized` response. When that happens, if the client also has a refresh token and if `useRefreshToken` is `true` (default), the client will attempt to automatically re-authorize itself and then it will re-run the failed request and eventually resolve it's promise with the final result. This means that your requests should never fail with `401`, unless the refresh token is also expired. If you don't want this, you can set `useRefreshToken` to `false`. There is a `refresh` method on the client that can call manually to obtain new access token using your existing refresh token. 

**Fetch single resource**
```js
const client = window.FHIR.client({ serviceUrl: "https://r3.smarthealthit.org" });
const result = await client.request("/Patient/2e27c71e-30c8-4ceb-8c1c-5641e066c0a4");
```

**Fetch the current patient**
```js
const client = window.FHIR.client({
    serviceUrl: "https://r3.smarthealthit.org",
    patientId: "2e27c71e-30c8-4ceb-8c1c-5641e066c0a4"
});
const result = await client.request(`/Patient/${client.patient.id}`);
```

**Fetch a bundle**
```js
const client = window.FHIR.client({ serviceUrl: "https://r3.smarthealthit.org" });
```

### Advanced Usage

**Resolve References**
```js
const client = window.FHIR.client({ serviceUrl: "https://r3.smarthealthit.org" });
const result = await client.request(
    "/Encounter/518a522a-4b10-47db-9daf-53b726d32607",
    resolveReferences: [ "serviceProvider" ]
);
```

**Extracting multiple related resources from single Observation:**
```js
const client = window.FHIR.client({ serviceUrl: "https://r3.smarthealthit.org" });
const result = await client.request(
    "/Observation/smart-691-bmi",
    resolveReferences: [
        "context",                 // The Encounter
        "context.serviceProvider", // The Organization (hospital)
        "performer.0",             // The Practitioner
        "subject"                  // The Patient
    ]
);
```

**Getting the references as separate object**

You can see that resolved references are "mounted" on the result tree, replacing
the value of the original reference property. If you don't want that behavior,
you can set the `graph` option to false. In this case, the promise will be
resolved with an object having two properties:
- `data` the original response data
- `references` a map of resolved references

Example:
```js
const client = window.FHIR.client({ serviceUrl: "https://r3.smarthealthit.org" });
const result = await client.request(
    "/Encounter/518a522a-4b10-47db-9daf-53b726d32607",
    resolveReferences: [ "serviceProvider" ],
    graph: false
);
```
