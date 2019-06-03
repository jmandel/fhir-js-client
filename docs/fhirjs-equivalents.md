## Fhir.js methods and their client-js equivalents

### read
```js
client.request("ResourceType/resourceId")

// client-js also has 3 methods for reading the current user, patient and encounter
client.user.read()
client.patient.read()
client.encounter.read()
```

### vread
```js
client.request("ResourceType/resourceId/_history/versionId")
```

### conformance
```js
client.request("metadata")
```

### search
```js
client.request("ResourceType?query")
```

### create
```js
client.request({
    url: "ResourceType",
    method: "POST"
    body: data
})
```

### update
```js
client.request({
    url: "ResourceType/resourceId",
    method: "PUT"
    body: data
})
```

### delete
```js
client.request({
    url: "ResourceType/resourceId",
    method: "DELETE"
})
```

### patch
```js
client.request({
    url: "ResourceType/resourceId",
    method: "PATCH"
    body: data
})
```

### transaction
```js
client.request({
    url: "/",
    method: "POST"
    body: data
})
```

### validate
```js
client.request({
    url: "ResourceType/resourceId/_validate",
    method: "POST"
    body: data
})
```
<!-- ### document
### profile
### history
### typeHistory
### resourceHistory
### nextPage
### prevPage
### resolve -->

### fetchAll
```js
client.request("ResourceType?optional-query", {
    pageLimit: 0
})
```

### fetchAllWithReferences
```js
client.request("ResourceType?optional-query", {
    pageLimit: 0,
    resolveReferences: [ "someReference" ],
    graph: false // Set to true or omit to have the references mounted into the resource tree
})
```


## Building query strings
Without fhir.js the mongo-like syntax is not available. However, the `request`
function also accepts `URL` instances as it's first argument (or as value of the `url`)
property of the first argument if that is an object. By using `fhir.js`, your browser
will be polyfill-ed if needed and `URL` and `URLSearchParams` will always be
available in the global scope (even in Node). Here are some examples of building search queries:

```js
const query = new URLSearchParams();
query.set("_sort", "name");
query.set("_count", 10);
client.request(`Patient?${query}`);


// Another example - comma-separated list of code makes an OR query
const query = new URLSearchParams();
query.set("code", [
    'http://loinc.org|29463-7', // weight
    'http://loinc.org|3141-9' , // weight
    'http://loinc.org|8302-2' , // Body height
    'http://loinc.org|8306-3' , // Body height --lying
    'http://loinc.org|8287-5' , // headC
    'http://loinc.org|39156-5', // BMI 39156-5
    'http://loinc.org|37362-1', // bone age
].join(","));
client.request(`Observation?${query}`);
```
