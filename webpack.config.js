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
        // externals: /node_modules/,
        devtool: "hidden-source-map",
        module: {
            rules: [
                {
                    test: /\.js$/,
                    exclude: /node_modules/,
                    use: ["babel-loader"]
                }
            ]
        },
        resolve: {
            extensions: ["*", ".js", ".json"]
        },
        plugins: isDev ? [
            new BundleAnalyzerPlugin({
                analyzerMode: "static",
                openAnalyzer: false
            })
        ] : []
    };
};
