const express = require("express");
const cors    = require("cors");


const app = express();
app.use(cors());

const mocks = [];

app.mock = mock => mocks.push(mock);
app.clear = () => mocks.splice(0, mocks.length);


app.all("*", (req, res, next) => {
    if (!mocks.length) {
        return next(new Error("No mocks defined for this request"));
    }
    const settings = mocks.shift();

    if (settings.headers) {
        res.set(settings.headers);
    }

    if (settings.status) {
        res.status(settings.status);
    }

    if (settings.body) {
        res.send(
            typeof settings.body == "object" ?
                JSON.stringify(settings.body) :
                settings.body
        );
    }

    if (settings.file) {
        res.sendFile(settings.file, { root: __dirname });
    } else {
        res.end();
    }
});


app.use((err, _req, res, _next) => { // eslint-disable-line
    res.status(500).send(err.meassage);
});

if (!module.parent) {
    const server = app.listen(3456, "0.0.0.0", () => {
        const addr = server.address();
        console.log(`Server listening at 0.0.0.0:${addr.port}`);
    });
}

module.exports = app;