const MemoryStorage = require("./MemoryStorage");

class HttpRequest
{
    constructor(url)
    {
        this.url = url;
        this.headers = {};
        this.session = new MemoryStorage();
    }
}

module.exports = HttpRequest;