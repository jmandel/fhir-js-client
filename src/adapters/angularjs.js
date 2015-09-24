(function() {

    var smart = require('../client/entry');

    angular.module('ng-fhir', ['ng']);

    angular.module('ng-fhir').provider('$fhir', function() {
        var prov;
        return prov = {
            $get: function($http, $q) {
                var adapter = {http: $http, defer: $q.defer, fhirjs: fhir};
                return smart(adapter);
            }
        };
    });

}).call(this);
