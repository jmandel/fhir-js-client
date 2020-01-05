class History
{
    public _location: string;

    constructor()
    {
        this._location = "";
    }

    public replaceState(a: any, b: any, loc: string)
    {
        this._location = loc;
    }
}

// tslint:disable-next-line:max-classes-per-file
export default class Window
{
    public FHIR: any;
    public history: History;

    public constructor()
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

    public atob(str: string) {
        return Buffer.from(str, "base64").toString("ascii");
    }
}
