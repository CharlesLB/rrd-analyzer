package version_test

import (
	"testing"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/shared/version"
)

// stamped sets the identity the release pipeline would have stamped, and puts the build's own back
// once the test is over, so no other test reads a version this one made up.
func stamped(t *testing.T, stampedVersion string, stampedCommit string) {
	t.Helper()

	builtVersion, builtCommit := version.Version, version.Commit
	t.Cleanup(func() {
		version.Version, version.Commit = builtVersion, builtCommit
	})

	version.Version, version.Commit = stampedVersion, stampedCommit
}

func TestSummaryNamesTheCommitShortenedToSevenCharacters(t *testing.T) {
	tests := []struct {
		name       string
		giveCommit string
		want       string
	}{
		{name: "no commit stamped", giveCommit: "none", want: "v1.4.0"},
		{name: "a commit already short", giveCommit: "504af33", want: "v1.4.0 (504af33)"},
		{name: "a full commit", giveCommit: "504af33d1c2b9e8f7a6b5c4d3e2f1a0b9c8d7e6f", want: "v1.4.0 (504af33)"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			stamped(t, "v1.4.0", tt.giveCommit)

			if got := version.Summary(); got != tt.want {
				t.Errorf("Summary() = %q, want %q", got, tt.want)
			}
		})
	}
}
