class ServerEnvironment
{
    constructor(request, response)
    {
        this.request = request;
        this.response = response;
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
        return this.request.session;
    }

    relative(url)
    {
        return new URL(url, this.request.url).href;
    }
}

module.exports = ServerEnvironment;
