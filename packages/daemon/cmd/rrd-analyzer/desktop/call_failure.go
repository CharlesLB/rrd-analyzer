package desktop

import "github.com/CharlesLB/rrd-analyzer/packages/daemon/cmd/internal/httpsurface"

// callFailure is what the page receives when a bound method fails. Left to itself, Wails sends the
// error's message alone, and the page tells failures apart by the status the same error answers
// with over HTTP: without it, a share service that cannot be reached, one refusing new sessions and
// a session too large to share all read as "the live link could not be created" in the desktop
// window, while the browser edition says which.
type callFailure struct {
	Status  int    `json:"status"`
	Message string `json:"message"`
}

// callFailureOf is the window's ErrorFormatter: one mapping from domain errors to statuses,
// httpsurface.StatusOf, serves every edition.
func callFailureOf(err error) any {
	return callFailure{Status: httpsurface.StatusOf(err), Message: err.Error()}
}
