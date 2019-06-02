var utils = module.exports =  {};

utils.byCodes = function(observations, property){

    var bank = utils.byCode(observations, property);
    function byCodes(){
        var ret = [];
        for (var i=0; i<arguments.length;i++){
            var set = bank[arguments[i]];
            if (set) {[].push.apply(ret, set);}
        }
        return ret;
    }

    return byCodes;
};

utils.byCode = function(observations, property){
    var ret = {};
    if (!Array.isArray(observations)){
        observations = [observations];
    }
    observations.forEach(function(o){
        if (o.resourceType === "Observation"){
            if (o[property] && Array.isArray(o[property].coding)) {
                o[property].coding.forEach(function (coding){
                    ret[coding.code] = ret[coding.code] || [];
                    ret[coding.code].push(o);
                });
            }
        }
    });
    return ret;
};

function ensureNumerical(pq) {
    if (typeof pq.value !== "number") {
        throw "Found a non-numerical unit: " + pq.value + " " + pq.code;
    }
}

utils.units = {
    cm({ code, value }) {
        ensureNumerical({ code, value });
        if (code == "cm"     ) return value;
        if (code == "m"      ) return   100 * value;
        if (code == "in"     ) return  2.54 * value;
        if (code == "[in_us]") return  2.54 * value;
        if (code == "[in_i]" ) return  2.54 * value;
        if (code == "ft"     ) return 30.48 * value;
        if (code == "[ft_us]") return 30.48 * value;
        throw "Unrecognized length unit: " + code;
    },
    kg({ code, value }){
        ensureNumerical({ code, value });
        if(code == "kg"    ) return value;
        if(code == "g"     ) return value / 1000;
        if(code.match(/lb/)) return value / 2.20462;
        if(code.match(/oz/)) return value / 35.274;
        throw "Unrecognized weight unit: " + code;
    },
    any(pq){
        ensureNumerical(pq);
        return pq.value;
    }
};


