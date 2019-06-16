/* global __dirname */
const path = require("path");
const BundleAnalyzerPlugin = require("webpack-bundle-analyzer").BundleAnalyzerPlugin;
const webpack = require("webpack");
const pkg = require("./package.json");

module.exports = function(env, argv) {
    const isDev = argv.mode === "development";

    const plugins = [
        new webpack.DefinePlugin({
            HAS_FETCH: argv.pure || !pkg.browserslist.find(str => str.match(/\bie\b/i))
        })
    ];

    plugins.push(new BundleAnalyzerPlugin({
        analyzerMode  : "static",
        openAnalyzer  : false,
        reportFilename: `bundle${argv.pure ? ".pure" : ""}.${isDev ? "dev" : "prod"}.html`
    }));

    return {
        entry: __dirname + "/src/browser.js",
        target: "web",
        output: {
            path      : __dirname + "/dist/build",
            filename  : `fhir-client${argv.pure ? ".pure" : ""}${isDev ? "" : ".min"}.js`,
            library: "FHIR",
            libraryTarget: "window"
        },
        devtool: "source-map",
        optimization: {
            providedExports: false,
            usedExports: true,
            sideEffects: true
        },
        module: {
            rules: [
                {
                    test: /\.js$/,
                    include: [
                        path.resolve(__dirname, "src"),
                        path.resolve(__dirname, "node_modules/debug")
                    ],
                    use: {
                        loader: "babel-loader",
                        options: {
                            plugins: ["@babel/plugin-transform-runtime"],
                            presets: argv.pure ? [] : [
                                [
                                    "@babel/preset-env",
                                    {
                                        useBuiltIns: "usage",
                                        modules: "commonjs",
                                        corejs: {
                                            version: 3,
                                            proposals: true
                                        },
                                        // debug: true,
                                        loose: true, // needed for IE 10
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
        plugins
    };
};
