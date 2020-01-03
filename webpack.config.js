const path = require("path");
const { BundleAnalyzerPlugin } = require("webpack-bundle-analyzer");
const { DefinePlugin } = require("webpack");

module.exports = function(env, argv) {
    process.env.BABEL_ENV = argv.pure ? "pure" : "browser";
    const isDev = argv.mode === "development";

    return {
        context: __dirname,
        entry: "./src/browser.ts",
        target: "web",
        output: {
            path      : path.resolve(__dirname, "dist/build"),
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
                    test: /\.ts$/,
                    exclude: /node_modules/,
                    use: [
                        {
                            loader: "ts-loader"
                        }
                    ]
                },
                {
                    test: /\.js$/,
                    include: [
                        path.join(__dirname, "src"),
                        path.join(__dirname, "node_modules/debug")
                    ],
                    use: "babel-loader?configFile=./.babelrc.js"
                },

                // All output '.js' files will have any sourcemaps re-processed by 'source-map-loader'.
                {
                    enforce: "pre",
                    test: /\.js$/,
                    loader: "source-map-loader"
                }
            ]
        },
        resolve: {
            extensions: [".ts", ".js"]
        },
        plugins: [
            new DefinePlugin({
                "global.FHIRCLIENT_PURE": argv.pure
            }),
            new BundleAnalyzerPlugin({
                analyzerMode  : "static",
                openAnalyzer  : false,
                reportFilename: `bundle${argv.pure ? ".pure" : ""}.${isDev ? "dev" : "prod"}.html`
            })
        ]
    };
};
