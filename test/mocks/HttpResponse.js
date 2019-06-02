class HttpResponse
{
    constructor()
    {
        this.status = 0;
        this.headers = {};
    }

    writeHead(status, headers)
    {
        this.status = status;
        Object.assign(this.headers, headers);
    }

    end() {}
}

module.exports = HttpResponse;