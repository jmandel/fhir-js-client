SMART on FHIR JavaScript Client Library
=======================================

## NPM Scripts

After `cd` into to the project folder and running `npm i`, you can use npm scripts to handle any project-related task:

### Testing
```sh
npm test
```

### Building
```sh

# Build everything
npm run build

# Only build minified scripts for production
npm run pack:prod

# Only build non-minified scripts for development
npm run pack:dev

# Only build non-minified scripts for development and watch them for changes
npm run build:dev
```

### Run examples locally
```sh
npm run examples
```

### Deploy documentation to github pages
```sh
npm run deploy:gh
```

The client library will be available in the `build` directory in multiple variants as follows:

* Files starting with `fhir-client`           - complete client library with jQuery and fhir included (no external dependencies)
* Files starting with `fhir-client-jquery`    - client library using jQuery, jQuery and fhir.js not included
* Files starting with `fhir-client-angularjs` - client library using AngularJS, AngularJS and fhir.js not included

## Usage
The documentation is work in progress. For usage examples and further documentation, please visit:
- http://docs.smarthealthit.org/client-js/index.html
- http://docs.smarthealthit.org/client-js/api.html
<!-- - http://docs.smarthealthit.org/client-js/request.html -->
- http://docs.smarthealthit.org/clients/javascript/

