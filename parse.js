var defs = require('./definitions.json')

module.exports = function(r) {
  return parse(r);
}

var parsers = {
  'float': function(v) {return parseFloat(v.value);},
  'integer': function(v) {return parseInt(v.value);},
  'date': function(v) {return new Date(v.value);},
  'string': function(v) {return (typeof v === 'string' ? v : v.value.toString());},
  'boolean': function(v) {return v.value.toString() === "true";}
};

function parse(r, path) {

  if (Array.isArray(r)){
    return r.map(function(e){
      return parse(e, path);
    });
  }

  if (typeof r !== 'object') {
    return r;
  }

  if (path === undefined || (path[0] == 'Resource')) {
    if (Object.keys(r).length  !== 1) {
      throw "Can't treat r as FHIR object: <> 1 key: " + r;
    }
    var resourceType = Object.keys(r)[0];
    var ret = parse(r[resourceType], [resourceType]);
    ret.resourceType = resourceType;
    return ret;
  }
  var context = defs[path.join(".")];
  var ret = {};
  Object.keys(r).forEach(function(k){
    var p = context && context.edges[k]
    if(p && parsers[p.parser]) {
      ret[k] = parsers[p.parser](r[k])
    } else {
      var nextContext = [k];
      if (p && p.next) {nextContext = p.next.split(".");}
      ret[k] = parse(r[k], nextContext);
    }
  });
  return ret
}
