/* global __dirname */
const BundleAnalyzerPlugin = require("webpack-bundle-analyzer").BundleAnalyzerPlugin;

module.exports = function(env, argv) {
    const isDev = argv.mode === "development";
    return {
        entry: {
            // fhir-client with jquery included 
            "fhir-client": ["babel-polyfill", __dirname + "/src/adapters/bundle.js" ],

            // fhir-client with NO jquery included (expects external jQuery)
            "fhir-client-jquery": ["babel-polyfill", __dirname + "/src/adapters/jquery.js" ],

            // fhir-client for Angular
            "fhir-client-angulajs": ["babel-polyfill", __dirname + "/src/adapters/angularjs.js"]
        },
        output: {
            path      : __dirname + "/build",
            publicPath: "/",
            filename  : `[name]${isDev ? "" : ".min"}.js`
        },
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
