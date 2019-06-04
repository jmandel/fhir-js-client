const ServerStorage = require("./ServerStorage");

class ServerEnvironment
{
    constructor(request, response, storage)
    {
        this.request  = request;
        this.response = response;

        if (storage) {
            if (typeof storage == "function") {
                this.storage = storage(request);
            } else {
                this.storage = storage;
            }
        } else {
            this.storage = new ServerStorage(this.request);
        }
    }

    getUrl()
    {
        return new URL(this.request.url);
    }

    redirect(location)
    {
        this.response.writeHead(302, { location });
        this.response.end();
    }

    getStorage()
    {
        return this.storage;
    }

    relative(url)
    {
        return new URL(url, this.request.url).href;
    }
}

module.exports = ServerEnvironment;
