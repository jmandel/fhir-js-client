module.exports = function (grunt) {

  grunt.loadNpmTasks('grunt-contrib-clean');
  grunt.loadNpmTasks('grunt-contrib-concat');
  grunt.loadNpmTasks('grunt-browserify');
  grunt.loadNpmTasks('grunt-shell');
  grunt.loadNpmTasks('grunt-curl');

  grunt.initConfig({
    curl: {
      conformance: {
        dest: 'vendor/conformance.json',
        src: 'http://hl7-fhir.github.io/conformance-base.json'
      }
    },
    shell: {
      definitions: {
        command: 'python tasks/generate_js_client.py > client/definitions.json',
      }
    },

    browserify: {
      vendor: {
        src: ['vendor/jQuery.js'],
        dest: 'dist/jQuery.js',
        options: {
          ignore: ['jquery'],
          shim: {
            'jQuery-browser': {
              path: 'vendor/jQuery.js',
              exports: '$'
            }
          }
        }
      },
      client: {
        src: ['client/entry.js'],
        dest: 'dist/client.js',
        options: {
          ignore: ['./node_modules/jquery/**', './node_modules/jsdom/**'],
          external: ['jQuery-browser']
        }
      },
    },

    concat: {
      'dist/fhir-client.js': ['dist/jQuery.js', 'dist/client.js']
    },

    clean: {  
      src : [ 'dist/jQuery.js', 'dist/client.js' ]
    }

  });



  grunt.registerTask('conformance', 'Download conformance base', ['curl:conformance']);
  grunt.registerTask('definitions', 'Build definitions.json', function(){
    var buildDefs = require('./client/build-definitions');
    buidDefs();
  
  });

  grunt.registerTask('default', ['browserify', 'concat', 'clean']);
  grunt.registerTask('all', ['definitions', 'default']);
};
