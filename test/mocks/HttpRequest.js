const MemoryStorage = require("./MemoryStorage");

class HttpRequest
{
    constructor(url)
    {
        this.url = url;
        this.session = new MemoryStorage();
    }
}

module.exports = HttpRequest;