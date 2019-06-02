class Storage
{
    get(key)
    {
        const value = sessionStorage[key];
        if (value) {
            return JSON.parse(value);
        }
        return null;
    }

    set(key, value)
    {
        sessionStorage[key] = JSON.stringify(value);
    }

    unset(key)
    {
        if (key in sessionStorage) {
            delete sessionStorage[key];
        }
    }

}

module.exports = Storage;
