module.exports = {

    // enable code coverage analysis
    coverage: true,

    // set code coverage path
    coveragePath: "src",

    // code coverage threshold percentage
    threshold: 80,

    // enable linting
    lint: false,

    // verbose test output
    verbose: true,

    // file pattern to use for locating tests
    pattern: "test/tests.js",

    // javascript file that exports an array of objects ie.
    //  [{
    //    ext: ".js",
    //    transform: function (content, filename) { ... }
    //  }]
    // transform: "node_modules/lab-transform-typescript",

    // ignore a list of globals for the leak detection (comma separated)
    globals: "fetch,Response,Headers,Request",

    // reporter type [console, html, json, tap, lcov, clover, junit]
    // Note that the order of entries corresponds to the `output` below
    reporter: [
        "console",
        "html",
        "lcov"
    ],

    // file path to write test results
    // Note that the order of entries corresponds to the `reporter` above
    output: [
        "stdout",
        "test/coverage.html",
        "test/lcov.info"
    ],

    // exit the process with a non zero exit code on the first test failure
    bail: false,

    // timeout for each test in milliseconds
    timeout: 5000,

    // timeout for before, after, beforeEach, afterEach in milliseconds
    contextTimeout: 2000,

    coverageExclude: ["node_modules", "lib", "test", "build"],

    // include all files in coveragePath in report
    coverageAll: false,

    // prevent recursive inclusion of all files in coveragePath in report
    coverageFlat: true,

    // file pattern to use for locating files for coverage
    // coveragePattern: "src/**.*",

    // -p, --default-plan-threshold    minimum plan threshold to apply to all tests that don't define any plan
    // -d, --dry                       skip all tests (dry run)

    // value to set NODE_ENV before tests
    environment: "test",

    // prevent recursive collection of tests within the provided path
    flat: true,

    // only run tests matching the given pattern which is internally compiled to a RegExp
    // grep: "High-level API",

    // -i, --id        test identifier
    // --inspect       starts lab with the node.js native debugger

    // disable global variable leaks detection
    leaks: true,

    // -n, --linter              linter path to use
    // --lint-fix                apply any fixes from the linter.
    // --lint-options            specify options to pass to linting program. It must be a string that is JSON.parse(able).
    // --lint-errors-threshold   linter errors threshold in absolute value
    // --lint-warnings-threshold linter warnings threshold in absolute value
    // --seed                    use this seed to randomize the order with `--shuffle`. This is useful to debug order dependent test failures

    // shuffle script execution order
    shuffle: false,

    // silence test output
    silence: false,

    // don’t output skipped tests
    silentSkips: false,

    // enable support for sourcemaps
    // sourcemaps: true
};
