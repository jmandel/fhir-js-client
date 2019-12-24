const babel = require("@babel/core");

function transform(content, filename) {
    if (/^node_modules/.test(filename)) {
        return content;
    }

    const config = babel.loadPartialConfig({
        filename,
        sourceMap: "inline",
        sourceFileName: filename,
        auxiliaryCommentBefore: "$lab:coverage:off$",
        auxiliaryCommentAfter: "$lab:coverage:on$"
    });

    const transformed = babel.transformSync(content, config.options);

    return transformed.code;
}

module.exports = [{ ext: ".js", transform }];