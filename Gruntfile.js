module.exports = function (grunt) {

  grunt.loadNpmTasks('grunt-contrib-clean');
  grunt.loadNpmTasks('grunt-contrib-concat');
  grunt.loadNpmTasks('grunt-shell');
  grunt.loadNpmTasks('grunt-contrib-uglify');

  grunt.initConfig({
    shell: {
      browserify: {
        command: "./node_modules/.bin/browserify  -e src/adapters/jquery.js  -i 'jsdom' -g varify > dist/fhir-client-jquery.js; ./node_modules/.bin/browserify  -e src/adapters/angularjs.js  -i 'jsdom' -g varify > dist/fhir-client-angularjs.js",
        options: {
          failOnError: true,
          stderr: true
        }
      }
    },
    uglify: {
      minifiedLib: {
        files: {
          'dist/fhir-client-jquery.min.js': ['dist/fhir-client-jquery.js'],
          'dist/fhir-client-angularjs.min.js': ['dist/fhir-client-angularjs.js']
        }
      }
    }
  });

  grunt.registerTask('browserify', 'Browserify to create window.FHIR', ['shell:browserify']);
  grunt.registerTask('default', ['browserify', 'uglify:minifiedLib']);
};
