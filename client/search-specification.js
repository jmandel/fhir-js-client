module.exports = function(mixins) {
  mixins = mixins || {};

  var specs = {};
  var util = require('util');
  var namespace = require('./namespace');
  var definitions = require('./build-definitions');

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

    this.queryUrl = function(){
      return '/'+this.resourceName+'/_search';
    };
 
    this.queryParams = function(){
      var clauses = this.__getClauses();
      var params = {};
      clauses.forEach(function(c){
        params[c.name] = params[c.name] || [];
        if (c.oneOf !== undefined) {
          var joined = c.oneOf.join(',');
          params[c.name].push(joined);
        } else {
          params[c.name].push(c.value);
        }
      });
      return params;
    }

  }

  defineSearchParam(SearchSpecification, new ReferenceSearchParam('_id'));
  defineSearchParam(SearchSpecification, new SearchParam('_count', '_count', true));
  defineSearchParam(SearchSpecification, new SearchParam('_sortAsc', '_sort:asc', true));
  defineSearchParam(SearchSpecification, new SearchParam('_sortDesc', '_sort:desc', true));
  defineSearchParam(SearchSpecification, new SearchParam('_include', '_include', true));


  function SearchParam(name, wireName, onlyOneHandler){
    wireName = wireName || name;
    this.name = name;
    this.handlers = { };
    var that = this;

    this.handlers[name] = function(value){
      return {
        name: wireName,
        value: value
      };
    };

    if (onlyOneHandler) {
      return;
    }
    this.handlers[name+'In'] = function(){
      var values = [];
      var singleArgHandler = this.handlers[name];

      Array.prototype.slice.call(arguments, 0).forEach(function(arg){
        if (!util.isArray(arg)){
          arg = [arg];
        }
        arg.forEach(function(arg){
          values.push(singleArgHandler.call(that, arg).value);
        });
      });

      for (var i=0;i<arguments.length;i++){
      }
      return {
        name: wireName,
        oneOf: values
      };
    };

    this.handlers[name+'Missing'] = function(value){
      return {
        name: name+':missing',
        value: value === 'false' ? false : Boolean(value)
      };
    };
  }

  function ReferenceSearchParam(name){
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

  function StringSearchParam(name){
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

  function TokenSearchParam(name){
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

  function DateSearchParam(name){
    SearchParam.apply(this, arguments);
  }
  DateSearchParam.prototype = new SearchParam();
  DateSearchParam.prototype.constructor = DateSearchParam;

  function NumberSearchParam(name){
    SearchParam.apply(this, arguments);
  }
  NumberSearchParam();
  NumberSearchParam.prototype.constructor = NumberSearchParam;

  function QuantitySearchParam(name){
    SearchParam.apply(this, arguments);
  }
  QuantitySearchParam.prototype = new SearchParam();
  QuantitySearchParam.prototype.constructor = QuantitySearchParam;

  function  CompositeSearchParam(name){
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

    specs[tname] = new resourceSpec();

  });


  Object.keys(mixins).forEach(function(m){
    SearchSpecification.prototype[m] = function(){
      var args = Array.prototype.slice.call(arguments, 0);
      args.unshift(this);
      return mixins[m][m].apply(mixins[m], args);
    };
  });


  return specs;

};
