module.exports = {
    "env": {
        "commonjs"           : true,
        "es6"                : true,
        "shared-node-browser": true
    },
    "globals": {
        "process": true
    },
    "extends": "eslint:recommended",
    "parserOptions": {
        "ecmaVersion": 10,
        "sourceType": "module"
    },
    "rules": {
        "indent"            : [ "warn", 4 ],
        "linebreak-style"   : [ "warn", "unix" ],
        "quotes"            : [ "warn", "double" ],
        "semi"              : [ "error", "always" ],
        "no-trailing-spaces": 1,
        "no-await-in-loop"  : 2,
        "no-console"        : 1
    },
    "overrides": [
        {
            "files": [
                "test/**/*",
                "webpack.config.js"
            ],
            "env": {
                "node": true
            }
        }
    ]
};