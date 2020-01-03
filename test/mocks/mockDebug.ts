require("debug");
require.cache[require.resolve("debug")].exports = createDebug;

function extend(namespace, delimiter = ":") {
    const newDebug = createDebug(this.namespace + (typeof delimiter === "undefined" ? ":" : delimiter) + namespace);
    newDebug.log = this.log;
    return newDebug;
}

export default function createDebug(namespace) {
    const debug = (...args) => {
        debug._calls.push(args);
    };
    Object.assign(debug, {
        namespace,
        extend,
        _calls: []
    });
    createDebug.instances.push(debug);
    return debug;
}
createDebug.instances = [];
