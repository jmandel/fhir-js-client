if (!HAS_FETCH && typeof window.fetch != "function") {
    window.fetch = require("isomorphic-fetch");
}