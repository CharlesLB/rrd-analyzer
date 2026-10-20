// Package version carries the build identity the release pipeline stamps in.
package version

// Set through -ldflags at build time; the defaults are what a `go run` reports.
var (
	Version = "dev"
	Commit  = "none"
	Date    = "unknown"
)

// Summary is the one-line identity shown in the window title and the about line.
func Summary() string {
	if Commit == "none" {
		return Version
	}

	return Version + " (" + shortCommit() + ")"
}

func shortCommit() string {
	const shortLength = 7
	if len(Commit) <= shortLength {
		return Commit
	}

	return Commit[:shortLength]
}
