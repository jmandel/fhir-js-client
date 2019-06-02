

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
