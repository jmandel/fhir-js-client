# Changelog

## v0.1.15
- Included the last version of fhir.js
    - For previous page, bundle.link.relation can either   have 'previous' or 'prev' value
    - Added getBundleByUrl api method
    - Added support for `le` and `ge` search parameters
    - Added support for `_include` and `_revinclude`
- Added a warning if the launch URL is not loaded properly

## v0.1.14
- Fixed the structure of the released package broken in `0.1.13`. Only the `dist`
  folder is released now.

## v0.1.13
- The profile claim can be absolute URL
- Examples use existing server and patient ID
- Resolve all npm vulnerabilities by updating to the latest versions
- Switch -g to -t for varify to resolve build issues
- Update lib/jqFhir.js with the latest version from https://github.com/FHIR/fhir.js/tree/v0.0.21.
- Added the changelog file
