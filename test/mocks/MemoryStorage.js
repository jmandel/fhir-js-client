
class MemoryStorage
{
    constructor()
    {
        this.__data = {};
    }

    async set(key, value) {
        this.__data[key] = value;
        return value;
    }

    async get(key) {
        return this.__data.hasOwnProperty(key) ? this.__data[key] : null;
    }

    async unset(key) {
        if (key in this.__data) {
            delete this.__data[key];
            return true;
        }
        return false;
    }
}

module.exports = MemoryStorage;