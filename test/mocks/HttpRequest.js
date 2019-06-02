const Storage = require("./Storage");

class HttpRequest
{
    constructor(url)
    {
        this.url = url;
        this.session = new Storage();
    }
}

module.exports = HttpRequest;