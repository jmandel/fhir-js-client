var adapter;

var Adapter = module.exports =  {debug: true}

Adapter.set = function (newAdapter) {
    adapter = newAdapter;
};

Adapter.get = function () {
    return adapter;
};
