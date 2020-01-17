export default class Storage
{
    constructor()
    {
        Object.defineProperties(this, {
            getItem: {
                value: (name: string) => this[name]
            },
            setItem: {
                value: (name: string, value: any) => this[name] = String(value)
            },
            removeItem: {
                value: (name: string) => delete this[name]
            },
            clear: {
                value: () => {
                    for (const key in this) {
                        delete this[key];
                    }
                }
            }
        });
    }
}
