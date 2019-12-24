import MemoryStorage from "./MemoryStorage";

export default class HttpRequest
{
    constructor(url)
    {
        this.url = url;
        this.headers = {};
        this.session = new MemoryStorage();
    }
}