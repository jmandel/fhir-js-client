(function() {
    var smart = require('../client/entry');
    var jQuery = require('jquery');
    var $ = jQuery;
    
    if (!process.browser) {
      var window = require('jsdom').jsdom().createWindow();
      jquery = jQuery(window);
    }
    
    var defer = function(){
        pr = jQuery.Deferred();
        pr.promise = pr.promise();
        return pr;
    };
    var adapter = {
        defer: defer,
        http: function(args) {
            var ret = jQuery.Deferred();
            var opts = {
                type: args.method,
                url: args.url,
                dataType: "json",
                data: args.data
            };
            jQuery.ajax(opts)
                .done(ret.resolve)
                .fail(ret.reject);
            return ret.promise();
        },
        fhirjs: require('../../lib/jqFhir.js')
    };

    smart(adapter);

}).call(this);
