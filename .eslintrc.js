module.exports = {
    "env": {
        "browser" : true,
        "commonjs": true,
        "es6"     : true,
        "node"    : true
    },
    "extends": "eslint:recommended",
    "parserOptions": {
        "ecmaVersion": 10,
        "ecmaFeatures": {
            "impliedStrict": true
        }
    },
    "rules": {
        "indent"            : [ "warn", 4 ],
        "linebreak-style"   : [ "warn", "unix" ],
        "quotes"            : [ "warn", "double" ],
        "semi"              : [ "error", "always" ],
        "no-trailing-spaces": 1,
        "no-await-in-loop"  : 2,
        "no-console"        : 1
    }
};