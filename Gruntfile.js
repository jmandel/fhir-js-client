module.exports = function (grunt) {

  grunt.loadNpmTasks('grunt-contrib-clean');
  grunt.loadNpmTasks('grunt-contrib-concat');
  grunt.loadNpmTasks('grunt-shell');
  grunt.loadNpmTasks('grunt-curl');
  grunt.loadNpmTasks('grunt-contrib-uglify');

  grunt.initConfig({
    curl: {
      conformance: {
        dest: 'vendor/conformance.json',
        src: 'http://hl7-fhir.github.io/conformance-base.json'
      }
    },
    shell: {
      browserify: {
        command: "./node_modules/.bin/browserify  -e client/entry.js  -i 'jsdom' -g 6to5ify > dist/fhir-client.js",
        options: {
          failOnError: true,
          stderr: true
        }
      }
    },
    uglify: {
      minifiedLib: {
        files: {
          'dist/fhir-client.min.js': ['dist/fhir-client.js']
        }
      }
    }
  });

  grunt.registerTask('browserify', 'Browserify to create window.FHIR', ['shell:browserify']);
  grunt.registerTask('conformance', 'Download conformance base', ['curl:conformance']);
  grunt.registerTask('default', ['browserify', 'uglify:minifiedLib']);
  grunt.registerTask('all', ['conformance', 'default']);
};
