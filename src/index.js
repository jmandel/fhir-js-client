if (typeof window === "undefined") {
    module.exports = require("./adapters/NodeAdapter");
} else {
    module.exports = require("./browser");
}