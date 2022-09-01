export default class Storage
{
    getItem(name: string) {
        return this[name];
    }

    setItem(name: string, value: any) {
        return this[name] = String(value);
    }

    removeItem(name: string) {
        delete this[name];
    }

    clear() {
        for (const key in this) {
            delete this[key];
        }
    }
}
