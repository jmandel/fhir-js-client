module.exports = specs = {};
var util = require('util');
var namespace = require('./namespace');
var definitions = require('./build-definitions');

var SearchParam = function SearchParam(name){
  this.name = name;
  this.handlers = { };

  this.handlers[name+'In'] = function(){
    var values = [];
    for (var i=0;i<arguments.length;i++){
      values.push(this.handlers[name].apply(this, [arguments[i]]).value);
    }
    return {
      name: name,
      oneOf: values
    };
  };

  this.handlers[name] = function(value){
    return {
      name: name,
      value: value
    };
  };

  this.handlers[name+'Missing'] = function(value){
    return {
      name: name+':missing',
      value: value === 'false' ? false : Boolean(value)
    };
  };

}

var ReferenceSearchParam = function ReferenceSearchParam(name){
  SearchParam.apply(this, arguments);

  this.handlers[name] = function(subSpec){
    var clauseName = name + ':' + subSpec.constructor.resourceName;

    if (typeof subSpec === 'string'){
      return {
        name: name,
        value: subSpec
      };
    }
    var clauses = subSpec.__getClauses();

    var ret = clauses.map(function(clause){

      var oneClause = {
        name: clauseName + '.' + clause.name
      };

      if (clause.value) oneClause.value = clause.value;
      if (clause.oneOf) oneClause.oneOf = clause.oneOf;

      if (clause.name == '_id') {
        oneClause = {
          name: clauseName,
          value: clause.value
        }
      }
      return oneClause
    });

    return ret;
  };

};

ReferenceSearchParam.prototype = new SearchParam();
ReferenceSearchParam.prototype.constructor = ReferenceSearchParam;

var StringSearchParam = function StringSearchParam(name){
  SearchParam.apply(this, arguments);

  this.handlers[name+'Exact'] = function(value){
    return {
      name: name+':exact',
      value: value
    };
  };

};
StringSearchParam.prototype = new SearchParam();
StringSearchParam.prototype.constructor = StringSearchParam;

var TokenSearchParam = function TokenSearchParam(name){
  SearchParam.apply(this, arguments);

  this.handlers[name] = function(ns, value){

    var ret = {
      name: name,
      value: ns + '|'+ value
    }

    if (value === undefined) {
      ret.value = ns;
    }

    if (ns === namespace.any) {
      ret.value = value;
    }

    if (ns === namespace.none) {
      ret.value = '|'+value;
    }

    return ret;

  };

  this.handlers[name+'Text'] = function(value){
    return {
      name: name,
      value: value
    };
  };



}
TokenSearchParam.prototype = new SearchParam();
TokenSearchParam.prototype.constructor = TokenSearchParam;

var DateSearchParam = function DateSearchParam(name){
  SearchParam.apply(this, arguments);
}
DateSearchParam.prototype = new SearchParam();
DateSearchParam.prototype.constructor = DateSearchParam;

var NumberSearchParam = function NumberSearchParam(name){
  SearchParam.apply(this, arguments);
}
NumberSearchParam();
NumberSearchParam.prototype.constructor = NumberSearchParam;

var QuantitySearchParam = function QuantitySearchParam(name){
  SearchParam.apply(this, arguments);
}
QuantitySearchParam.prototype = new SearchParam();
QuantitySearchParam.prototype.constructor = QuantitySearchParam;

var CompositeSearchParam = function  CompositeSearchParam(name){
  SearchParam.apply(this, arguments);
}
CompositeSearchParam.prototype = new SearchParam();
CompositeSearchParam.prototype.constructor = CompositeSearchParam;


var paramTypes = {
  string: StringSearchParam,
  reference: ReferenceSearchParam,
  token: TokenSearchParam,
  number: NumberSearchParam,
  quantity: QuantitySearchParam,
  date: DateSearchParam,
  composite: CompositeSearchParam
}

Object.keys(definitions).forEach(function(tname){
  var params = definitions[tname].params;

  // Create a subclass of 'SearchSpecification'
  // to track search parameters for each resource
  // e.g. Patient knows about given name, family name, etc.
  var resourceSpec = function(){
    SearchSpecification.apply(this, arguments);
  };

  resourceSpec.prototype = new SearchSpecification();
  resourceSpec.prototype.constructor = resourceSpec;
  resourceSpec.resourceName = tname;

  params.forEach(function(p){
    defineSearchParam(resourceSpec, new paramTypes[p.type](p.name));
  });

  defineSearchParam(resourceSpec, new paramTypes['reference']('_id'));

  specs[tname] = new resourceSpec();

});

function defineSearchParam(resourceSpec, searchParam) {
  Object.keys(searchParam.handlers).forEach(function(handlerName){

    resourceSpec.prototype[handlerName] = function(){

      var clause = searchParam.handlers[handlerName].apply(
        searchParam, arguments
      );
      return this.__addClause(clause);

    }
  });
}

function SearchSpecification(clauses){ 

  if (clauses === undefined) {
    clauses = [];
  }

  this.resourceName = this.constructor.resourceName;

  this.__addClause = function(c){
    var newClauses = JSON.parse(JSON.stringify(clauses));
    if (!util.isArray(c)){
      c = [c];
    }

    [].push.apply(newClauses, c);
    return new (this.constructor)(newClauses);
  }

  this.__getClauses = function(){
    return clauses;
  }

  this.__printClauses = function(){
    console.log(clauses);
  }

  this.queryParams = function(){
    var clauses = this.__getClauses();
    var params = {};
    clauses.forEach(function(c){
      var name = encodeURIComponent(c.name);
      params[name] = params[name] || [];
      if (c.oneOf !== undefined) {
        var joined = c.oneOf.join(',');
        params[name].push(encodeURIComponent(joined));
      } else {
        params[name].push(encodeURIComponent(c.value));
      }
    });
    return params;
  }

}
