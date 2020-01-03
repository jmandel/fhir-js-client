export default class Location
{
    public href: string;

    constructor(url: string) {
        this.href = url;
    }

    public toString() {
        return this.href;
    }
}
