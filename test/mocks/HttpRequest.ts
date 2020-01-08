import MemoryStorage from "./MemoryStorage";

export default class HttpRequest
{
    url: URL | string;
    headers: { [key: string]: any };
    session: MemoryStorage;

    constructor(url: URL | string)
    {
        this.url = url;
        this.headers = {};
        this.session = new MemoryStorage();
    }
}
