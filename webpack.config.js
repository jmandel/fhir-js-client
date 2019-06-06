/* global __dirname */
const BundleAnalyzerPlugin = require("webpack-bundle-analyzer").BundleAnalyzerPlugin;

module.exports = function(env, argv) {
    const isDev = argv.mode === "development";
    return {
        entry: __dirname + "/src/entry.js",
        target: "web",
        output: {
            path      : __dirname + "/build",
            publicPath: "/",
            filename  : `fhir-client${isDev ? "" : ".min"}.js`
        },
        devtool: "hidden-source-map",
        module: {
            rules: [
                {
                    test: /\.js$/,
                    // exclude: /node_modules/,
                    use: {
                        loader: "babel-loader",
                        options: {
                            presets: [
                                [
                                    "@babel/preset-env",
                                    {
                                        useBuiltIns: "entry",
                                        corejs: { version: 3, proposals: true },
                                        // "spec": true,
                                        // "loose": true,
                                        targets: [
                                            "last 2 Chrome versions",
                                            "last 2 firefox versions",
                                            "last 2 Edge versions",
                                            "ie 10-11"
                                        ]
                                    }
                                ]
                            ]
                        }
                    }
                }
            ]
        },
        resolve: {
            extensions: [".js"]
        },
        plugins: isDev ? [
            new BundleAnalyzerPlugin({
                analyzerMode: "static",
                openAnalyzer: false
            })
        ] : []
    };
};
