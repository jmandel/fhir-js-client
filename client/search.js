module.exports = Search;
var $ = jQuery = require('./jquery');

function Search(p) {

  var search = {};

  search.client = p.client;
  search.spec = p.spec;
  search.count = p.count || 50;

  var nextPageUrl = null;

  function gotBundle(d){
    return function(bundle, status) {

      nextPageUrl = null; 

      if(bundle.link) {
        var next = bundle.link.filter(function(l){
          return l.relation === "next";
        });
        if (next.length === 1) {
          nextPageUrl = next[0].url 
        }
      }

      var results = search.client.indexBundle(bundle); 
      d.resolve(results, search);
    }
  }

  function failedBundle(d){
    return function(failure){
      d.reject("Search failed.", arguments);
    }
  }

  search.hasNext = function(){
    return nextPageUrl !== null;
  };

  search.next = function() {

    if (nextPageUrl === null) {
      throw "Next page of search not available!";
    }

    var searchParams = {
      type: 'GET',
      url: nextPageUrl,
      dataType: 'json',
      traditional: true
    };

    var ret = new $.Deferred();
    console.log("Nexting", searchParams);
    $.ajax(search.client.authenticated(searchParams))
    .done(gotBundle(ret))
    .fail(failedBundle(ret));

    return ret;
  };

  search.execute = function() {


    var searchParams = {
      type: 'GET',
      url: search.client.urlFor(search.spec),
      data: search.spec.queryParams(),
      dataType: "json",
      traditional: true
    };

    var ret = new $.Deferred();

    $.ajax(search.client.authenticated(searchParams))
    .done(gotBundle(ret))
    .fail(failedBundle(ret));

    return ret;
  };

  return search;
}

