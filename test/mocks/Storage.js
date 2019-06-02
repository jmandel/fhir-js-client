
class Storage
{
    constructor()
    {
        this.__data = {};
    }

    set(key, value) {
        this.__data[key] = value;
    }

    get(key) {
        return this.__data.hasOwnProperty(key) ? this.__data[key] : null;
    }

    unset(key) {
        if (key in this.__data) {
            delete this.__data[key];
        }
    }
}

module.exports = Storage;