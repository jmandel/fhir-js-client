module.exports = Search;
var jQuery = require('./jquery');
var $ = jQuery;

function Search(p) {

  var search = {};

  search.client = p.client;
  search.spec = p.spec;
  search.count = p.count || 50;

  var nextPageUrl = null;

  function gotFeed(d){
    return function(data, status) {

      nextPageUrl = null; 
      var feed = data.feed || data;

      if(feed.link) {
        var next = feed.link.filter(function(l){
          return l.rel === "next";
        });
        if (next.length === 1) {
          nextPageUrl = next[0].href 
        }
      }

      var results = search.client.indexFeed(data); 
      d.resolve(results, search);
    }
  };

  function failedFeed(d){
    return function(failure){
      d.reject("Search failed.", arguments);
    }
  };

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
    .done(gotFeed(ret))
    .fail(failedFeed(ret));

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
    .done(gotFeed(ret))
    .fail(failedFeed(ret));

    return ret;
  };

  return search;
}

