(function() {
    var smart = require('../client/entry');
    var jquery = jQuery;
    
    if (!process.browser) {
      var window = require('jsdom').jsdom().createWindow();
      jquery = jQuery(window);
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
        fhirjs: fhir
    };

    smart(adapter);

}).call(this);
