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
      browserify: {
        command: "./node_modules/.bin/browserify  -d  -e client/entry.js  -i './node_modules/jsdom/**'   > dist/fhir-client.js",
      }
    },
  });

  grunt.registerTask('browserify', 'Browserify to create window.FHIR', ['shell:browserify']);
  grunt.registerTask('conformance', 'Download conformance base', ['curl:conformance']);
  grunt.registerTask('default', ['browserify']);
  grunt.registerTask('all', ['definitions', 'default']);
};
