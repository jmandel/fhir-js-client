module.exports = {
    "env": {
        "browser": true,
        "commonjs": true,
        "es6": true
    },
    "globals": {
        "process": "readonly"
    },
    "extends": [
        "eslint:recommended"
    ],
    "parserOptions": {
        "ecmaVersion": 2018
    },
    "rules": {
        "indent"         : [ "warn", 4 ],
        "linebreak-style": [ "warn", "unix" ],
        "quotes"         : [ "warn", "double" ],
        "no-console"     : 0,
        "semi"           : [ "error", "always" ]
    }
};