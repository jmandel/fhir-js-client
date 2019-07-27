# Changelog

## v2.1.0
- Added convenience wrappers for the FHIR create/update/delete operations #56
- Added patient context aware request wrapper #57
- Fixed a refresh issue in Firefox #58
- Improved fake token flow #59
- Added `getFhirVersion` and `getFhirRelease` client methods
- Few other minor fixes and improvements

## v2.0.7
- See http://docs.smarthealthit.org/client-js/v2.html

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
