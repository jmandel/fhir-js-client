const path = require("path");
const { BundleAnalyzerPlugin } = require("webpack-bundle-analyzer");
const { DefinePlugin } = require("webpack");

const BASE_CONFIG = {
    context: __dirname,
    entry  : "./src/browser.ts",
    target : "web",
    devtool: "source-map",
    // optimization: {
    //     providedExports: false,
    //     usedExports: true,
    //     sideEffects: true
    // },
    resolve: {
        extensions: [".ts", ".js"]
    }
};

const PURE_DEV_BUILD = Object.assign({}, BASE_CONFIG, {
    mode   : "development",
    output : {
        path         : path.resolve(__dirname, "dist/build"),
        filename     : "fhir-client.pure.js",
        library      : "FHIR",
        libraryTarget: "window"
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                exclude: /node_modules/,
                use: [
                    "babel-loader?configFile=./.babelrc.js&envName=pure",
                    "ts-loader"
                ]
            }
        ]
    },
    plugins: [
        new DefinePlugin({ "global.FHIRCLIENT_PURE": true }),
        new BundleAnalyzerPlugin({
            analyzerMode  : "static",
            openAnalyzer  : false,
            reportFilename: "bundle.pure.dev.html"
        })
    ]
});

const PURE_PROD_BUILD = Object.assign({}, BASE_CONFIG, {
    mode   : "production",
    output : {
        path         : path.resolve(__dirname, "dist/build"),
        filename     : "fhir-client.pure.min.js",
        library      : "FHIR",
        libraryTarget: "window"
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                exclude: /node_modules/,
                use: [
                    "babel-loader?configFile=./.babelrc.js&envName=pure",
                    "ts-loader"
                ]
            }
        ]
    },
    plugins: [
        new DefinePlugin({ "global.FHIRCLIENT_PURE": true }),
        new BundleAnalyzerPlugin({
            analyzerMode  : "static",
            openAnalyzer  : false,
            reportFilename: "bundle.pure.prod.html"
        })
    ]
});

const BROWSER_DEV_BUILD = Object.assign({}, BASE_CONFIG, {
    mode   : "development",
    output : {
        path         : path.resolve(__dirname, "dist/build"),
        filename     : "fhir-client.js",
        library      : "FHIR",
        libraryTarget: "window"
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                exclude: /node_modules/,
                use: [
                    "babel-loader?configFile=./.babelrc.js&envName=browser",
                    "ts-loader"
                ]
            }
        ]
    },
    plugins: [
        new BundleAnalyzerPlugin({
            analyzerMode  : "static",
            openAnalyzer  : false,
            reportFilename: "bundle.dev.html"
        })
    ]
});

const BROWSER_PROD_BUILD = Object.assign({}, BASE_CONFIG, {
    mode   : "production",
    output : {
        path         : path.resolve(__dirname, "dist/build"),
        filename     : "fhir-client.min.js",
        library      : "FHIR",
        libraryTarget: "window"
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                exclude: /node_modules/,
                use: [
                    "babel-loader?configFile=./.babelrc.js&envName=browser",
                    "ts-loader"
                ]
            }
        ]
    },
    plugins: [
        new BundleAnalyzerPlugin({
            analyzerMode  : "static",
            openAnalyzer  : false,
            reportFilename: "bundle.dev.html"
        })
    ]
});


module.exports = [
    PURE_DEV_BUILD,
    PURE_PROD_BUILD,
    BROWSER_DEV_BUILD,
    BROWSER_PROD_BUILD
];
