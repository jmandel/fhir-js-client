
export default class MemoryStorage
{
    private __data: { [key: string]: any };

    constructor()
    {
        this.__data = {};
    }

    async set(key: string, value: any) {
        this.__data[key] = value;
        return value;
    }

    async get(key: string) {
        return Object.prototype.hasOwnProperty.call(this.__data, key) ? this.__data[key] : null;
    }

    async unset(key: string) {
        if (key in this.__data) {
            delete this.__data[key];
            return true;
        }
        return false;
    }
}
