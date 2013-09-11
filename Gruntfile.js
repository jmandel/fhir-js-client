module.exports = function (grunt) {

  grunt.loadNpmTasks('grunt-contrib-clean');
  grunt.loadNpmTasks('grunt-contrib-concat');
  grunt.loadNpmTasks('grunt-browserify');
  grunt.loadNpmTasks('grunt-shell');

  grunt.initConfig({

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
          ignore: ['jquery'],
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

  grunt.registerTask('definitions', 'Build definitions.json from FHIR profiles', ['shell:definitions']);
  grunt.registerTask('default', ['browserify', 'concat', 'clean']);
  grunt.registerTask('all', ['definitions', 'default']);
};
