SMART on FHIR JavaScript Library
================================

This is a JavaScript library for connecting SMART apps to Fhir servers.
It works both in browsers (IE10+) and on the server (NodeJS).

## Installation

Install from npm:
```sh
npm i fhirclient
```

<br/>

## Documentation (new)
The documentation for the upcoming release is available at [http://docs.smarthealthit.org/client-js/](http://docs.smarthealthit.org/client-js/).

Check out [what's new in v2](http://docs.smarthealthit.org/client-js/v2.html)!

<br/>

## Documentation (old) 
The documentation for the older (current) version is at [http://docs.smarthealthit.org/clients/javascript/](http://docs.smarthealthit.org/clients/javascript/).

<br/>

## Contributing and Development

### NPM Scripts

After you `cd` into to the project folder and run `npm i`, you can use npm scripts to handle any project-related task:

```sh
# run tests
npm test

# Build everything
npm run build

# Build all bundles
npm run pack

# Only build the minified bundle for production
npm run pack:prod

# Only build the pure (no polyfills included) minified bundle for production
npm run pack:prod:pure

# Only build non-minified bundle for development
npm run pack:dev

# Only build the pure (no polyfills included) bundle for development
npm run pack:dev:pure

# Only build non-minified bundle for development and rebuild on change
npm run build:dev

# Build the CommonJS modules (for Node and bundlers)
npm run build:module
```

## License
Apache 2.0


