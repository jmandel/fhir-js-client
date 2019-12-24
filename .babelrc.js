const moduleConfig = {
    presets: [
        ["@babel/preset-env", {
            useBuiltIns: "usage",
            modules: "commonjs",
            corejs: {
                version: 3
            },
            targets: "maintained node versions"
        }]
    ]
}

module.exports = {
    env: {
        pure: {},
        browser: {
            presets: [
                ["@babel/preset-env", {
                    useBuiltIns: "usage",
                    modules: false,
                    corejs: {
                        version: 3
                    },
                    targets: [
                        "last 2 Chrome versions",
                        "last 2 firefox versions",
                        "last 2 Edge versions",
                        "ie 10-11"
                    ],
                    // debug: true,
                    loose: true, // needed for IE 10
                }]
            ]
        },
        module: moduleConfig,
        test: moduleConfig,
    }
}