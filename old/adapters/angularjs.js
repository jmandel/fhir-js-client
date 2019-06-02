(function() {
    /* global angular, fhir */
    var smart = require("../client/entry");

    angular.module("ng-fhir", ["ng"]);

    angular.module("ng-fhir").provider("$fhir", function() {
        return {
            $get: function($http, $q) {
                var adapter = {http: $http, defer: $q.defer, fhirjs: fhir};
                return smart(adapter);
            }
        };
    });

}).call(this);
