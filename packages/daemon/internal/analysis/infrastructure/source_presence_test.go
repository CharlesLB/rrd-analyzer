package infrastructure_test

import (
	"context"
	"path/filepath"
	"testing"

	analysisInfra "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/analysis/infrastructure"
)

func TestSourcePresenceTellsAFileOnDiskFromOneThatIsGone(t *testing.T) {
	onDisk := writeSource(t, "RRD dump")

	tests := []struct {
		name string
		give string
		want bool
	}{
		{name: "a file on disk", give: onDisk, want: true},
		{name: "a file that is gone", give: filepath.Join(filepath.Dir(onDisk), "moved.rrd"), want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			exists, err := analysisInfra.NewSourcePresence().Exists(context.Background(), tt.give)
			if err != nil {
				t.Fatalf("exists: %v", err)
			}

			if exists != tt.want {
				t.Errorf("exists = %t, want %t", exists, tt.want)
			}
		})
	}
}

func TestSourcePresenceStopsWhenTheCallerHasGivenUp(t *testing.T) {
	cancelled, cancel := context.WithCancel(context.Background())
	cancel()

	if _, err := analysisInfra.NewSourcePresence().Exists(cancelled, writeSource(t, "RRD dump")); err == nil {
		t.Fatal("exists answered for a caller that had given up")
	}
}
