import ServerStorage from "../../src/storage/ServerStorage";

export default class ServerEnvironment
{
    public request: any;

    public response: any;

    public storage: any;

    constructor(request?: any, response?: any, storage?: any)
    {
        this.request  = request;
        this.response = response;

        if (storage) {
            if (typeof storage == "function") {
                this.storage = storage(request, response);
            } else {
                this.storage = storage;
            }
        } else {
            this.storage = new ServerStorage(this.request);
        }
    }

    public getUrl()
    {
        const req = this.request;
        const host = req.headers["x-forwarded-host"] || req.headers.host;
        const protocol = req.headers["x-forwarded-proto"] || req.protocol || "http";
        // if (!host) {
        //     const addr = req.socket.address() as AddressInfo;
        //     host = addr.address.replace("::1", "localhost");
        //     if ((addr.port != 80  && req.protocol == "http") ||
        //         (addr.port != 443 && req.protocol == "https"))
        //     {
        //         host += ":" + addr.port;
        //     }
        // }
        return new URL(req.originalUrl || req.path || req.url, protocol + "://" + host);
    }

    public redirect(location)
    {
        this.response.writeHead(302, { location });
        this.response.end();
    }

    public getStorage()
    {
        return this.storage;
    }

    public relative(url: string)
    {
        return new URL(url, this.getUrl()).href;
    }
}
