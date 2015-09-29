(function() {
    var smart = require('../client/entry');
    var jquery = _jQuery = require('jquery');
    
    if (!process.browser) {
      var window = require('jsdom').jsdom().createWindow();
      jquery = jquery(window);
    }
    
    var defer = function(){
        pr = jquery.Deferred();
        pr.promise = pr.promise();
        return pr;
    };
    var adapter = {
        defer: defer,
        http: function(args) {
            var ret = jquery.Deferred();
            var opts = {
                type: args.method,
                url: args.url,
                dataType: "json",
                data: args.data
            };
            jquery.ajax(opts)
                .done(ret.resolve)
                .fail(ret.reject);
            return ret.promise();
        },
        fhirjs: require('../../lib/jqFhir.js')
    };

    smart(adapter);

}).call(this);
