class History
{
    constructor()
    {
        this._location = "";
    }

    replaceState(a, b, loc)
    {
        this._location = loc;
    }
}

class Window
{
    constructor()
    {
        this.history = new History();

        this.FHIR = {
            // client: (...args) => new Client(env, ...args),
            oauth2: {
                settings: {
                    replaceBrowserHistory: true,
                    fullSessionStorageSupport: true
                },
                // ready: (...args) => smart.ready(env, ...args),
                // authorize: (...args) => smart.authorize(env, ...args)
                // $lab:coverage:on$
            }
        };
    }

    atob(str) {
        return Buffer.from(str, "base64").toString("ascii");
    }
}

module.exports = Window;