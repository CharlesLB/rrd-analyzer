package domain_test

import (
	"encoding/json"
	"math"
	"strings"
	"testing"

	seriesDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/series/domain"
)

// sampleBySample is how a window was encoded before it learned to encode itself: every sample
// through its own MarshalJSON.
func sampleBySample(t *testing.T, window seriesDomain.Window) string {
	t.Helper()

	encoded, err := json.Marshal(struct {
		SeriesID string                `json:"seriesId"`
		Samples  []seriesDomain.Sample `json:"samples"`
	}{window.SeriesID, window.Samples})
	if err != nil {
		t.Fatalf("encode sample by sample: %v", err)
	}

	return string(encoded)
}

func TestWindowEncodesExactlyAsItsSamplesWouldOneByOne(t *testing.T) {
	window := seriesDomain.Window{
		SeriesID: `s"0`,
		Samples: []seriesDomain.Sample{
			seriesDomain.Known(0), seriesDomain.Known(math.Copysign(0, -1)), seriesDomain.Known(42), seriesDomain.Known(-3.25),
			seriesDomain.Known(1e-7), seriesDomain.Known(1e21), seriesDomain.Known(123456789.123456789), seriesDomain.Known(5.4e9),
			seriesDomain.Unknown(), seriesDomain.Known(math.NaN()), seriesDomain.Known(math.Inf(1)), seriesDomain.Known(math.Inf(-1)),
		},
	}

	encoded, err := json.Marshal(window)
	if err != nil {
		t.Fatalf("encode window: %v", err)
	}

	if got, want := string(encoded), sampleBySample(t, window); got != want {
		t.Fatalf("window encodes as\n%s\nwant\n%s", got, want)
	}
}

func TestWindowWithNoSamplesEncodesAnEmptyListRatherThanNull(t *testing.T) {
	encoded, err := json.Marshal(seriesDomain.Window{SeriesID: "s0", Samples: []seriesDomain.Sample{}})
	if err != nil {
		t.Fatalf("encode window: %v", err)
	}

	if !strings.Contains(string(encoded), `"samples":[]`) {
		t.Fatalf("window encodes as %s, want an empty samples list", encoded)
	}
}

func BenchmarkWindowEncoding_TenChartsOf260Columns(b *testing.B) {
	windows := make([]seriesDomain.Window, 10)
	for index := range windows {
		samples := make([]seriesDomain.Sample, 260)
		for column := range samples {
			samples[column] = seriesDomain.Known(float64(column) * 1.37)
		}

		windows[index] = seriesDomain.Window{SeriesID: "s0", Samples: samples}
	}

	for b.Loop() {
		if _, err := json.Marshal(windows); err != nil {
			b.Fatal(err)
		}
	}
}
