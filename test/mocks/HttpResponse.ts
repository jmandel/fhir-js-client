export default class HttpResponse
{
    public status: number;
    public headers: {[key: string]: any};
    constructor()
    {
        this.status = 0;
        this.headers = {};
    }

    public writeHead(status: number, headers: {[key: string]: any})
    {
        this.status = status;
        Object.assign(this.headers, headers);
    }

    // tslint:disable-next-line:no-empty
    public end(): void {}
}
