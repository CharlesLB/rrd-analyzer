// Package shareservice names the share service a build speaks to, the way package version names
// the build itself: the address is stamped at link time (-X …/shareservice.URL=https://…) from
// SHARE_SERVICE_URL, by the Makefile, tools/build-browser-runtime.sh and the GoReleaser
// configurations.
//
// It is left empty by default, and an empty address is a build that shares nothing: every live
// session route answers that sharing is not configured, and the frontend shows no share button. A
// build that silently pointed at someone's service would upload a person's files to a host they
// never chose.
package shareservice

// URL is the share service's address, scheme and host with no trailing slash, or empty.
var URL = ""
