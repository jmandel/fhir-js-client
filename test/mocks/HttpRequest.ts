import MemoryStorage from "./MemoryStorage";

export default class HttpRequest
{
    public url: URL;
    public headers: { [key: string]: any };
    public session: MemoryStorage;

    constructor(url: URL)
    {
        this.url = url;
        this.headers = {};
        this.session = new MemoryStorage();
    }
}