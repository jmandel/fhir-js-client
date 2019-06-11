/* global __dirname */
const BundleAnalyzerPlugin = require("webpack-bundle-analyzer").BundleAnalyzerPlugin;
// const webpack = require("webpack");

module.exports = function(env, argv) {
    const isDev = argv.mode === "development";

    const plugins = [
        // new webpack.ProvidePlugin({
        //     "fetch" : "isomorphic-fetch"
        // })
    ];

    if (isDev) {
        plugins.push(new BundleAnalyzerPlugin({
            analyzerMode: "static",
            openAnalyzer: false
        }));
    }

    return {
        entry: __dirname + "/src/entry.js",
        target: "web",
        output: {
            path      : __dirname + "/build",
            publicPath: "/",
            filename  : `fhir-client${isDev ? "" : ".min"}.js`
        },
        devtool: "hidden-source-map",
        optimization: {
            providedExports: false,
            usedExports: true,
            // sideEffects: true
        },
        module: {
            rules: [
                {
                    test: /\.js$/,
                    // exclude: /node_modules/,
                    use: {
                        loader: "babel-loader",
                        // options: {
                        //     presets: [
                        //         [
                        //             "@babel/preset-env",
                        //             {
                        //                 useBuiltIns: "usage",
                        //                 corejs: {
                        //                     version: 3,
                        //                     proposals: true
                        //                 },
                        //                 // "spec": true,
                        //                 // "loose": true,
                        //                 targets: [
                        //                     // chrome: 75
                        //                     "last 2 Chrome versions",
                        //                     "last 2 firefox versions",
                        //                     "last 2 Edge versions",
                        //                     "ie 10-11"
                        //                 ]
                        //             }
                        //         ]
                        //     ]
                        // }
                    }
                }
            ]
        },
        resolve: {
            extensions: [".js"]
        },
        plugins
    };
};
