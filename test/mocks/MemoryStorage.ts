
export default class MemoryStorage
{
    private _data: { [key: string]: any };

    constructor()
    {
        this._data = {};
    }

    async set(key: string, value: any) {
        this._data[key] = value;
        return value;
    }

    async get(key: string) {
        return Object.prototype.hasOwnProperty.call(this._data, key) ? this._data[key] : null;
    }

    async unset(key: string) {
        if (key in this._data) {
            delete this._data[key];
            return true;
        }
        return false;
    }
}
