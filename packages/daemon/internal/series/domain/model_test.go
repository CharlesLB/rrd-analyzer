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

func TestSampleDecodesWhatItEncodes(t *testing.T) {
	tests := []struct {
		name string
		give string
		want seriesDomain.Sample
	}{
		{name: "a reading", give: "42.5", want: seriesDomain.Known(42.5)},
		{name: "a hole", give: "null", want: seriesDomain.Unknown()},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var got seriesDomain.Sample
			if err := json.Unmarshal([]byte(tt.give), &got); err != nil {
				t.Fatalf("decode %s: %v", tt.give, err)
			}

			if got != tt.want {
				t.Errorf("sample = %+v, want %+v", got, tt.want)
			}
		})
	}
}

func TestSampleRefusesAValueThatIsNotANumber(t *testing.T) {
	var sample seriesDomain.Sample

	if err := json.Unmarshal([]byte(`"forty"`), &sample); err == nil {
		t.Fatalf("decoded %+v from text, want the text refused", sample)
	}
}

const holtWintersPrediction = "HWPREDICT"

func TestKnownConsolidationFunctionNamesOnlyWhatIsPlotted(t *testing.T) {
	tests := []struct {
		give      string
		want      seriesDomain.ConsolidationFunction
		wantKnown bool
	}{
		{give: "AVERAGE", want: seriesDomain.ConsolidationAverage, wantKnown: true},
		{give: "MIN", want: seriesDomain.ConsolidationMinimum, wantKnown: true},
		{give: "MAX", want: seriesDomain.ConsolidationMaximum, wantKnown: true},
		{give: "LAST", want: seriesDomain.ConsolidationLast, wantKnown: true},
		{give: holtWintersPrediction, want: seriesDomain.ConsolidationAverage, wantKnown: false},
	}

	for _, tt := range tests {
		t.Run(tt.give, func(t *testing.T) {
			got, known := seriesDomain.KnownConsolidationFunction(tt.give)

			if got != tt.want || known != tt.wantKnown {
				t.Errorf("KnownConsolidationFunction(%q) = %q, %t; want %q, %t", tt.give, got, known, tt.want, tt.wantKnown)
			}
		})
	}
}

func TestParseConsolidationFunctionReadsAnUnplottedConsolidationAsTheAverage(t *testing.T) {
	if got := seriesDomain.ParseConsolidationFunction(holtWintersPrediction); got != seriesDomain.ConsolidationAverage {
		t.Errorf("ParseConsolidationFunction(%q) = %q, want %q", holtWintersPrediction, got, seriesDomain.ConsolidationAverage)
	}
}

func TestArchiveWithoutRowsEndsWhereItStarts(t *testing.T) {
	const startMilliseconds = 2 * rangeStep

	archive := seriesDomain.Archive{StepMilliseconds: rangeStep, StartMilliseconds: startMilliseconds, CoversIntervals: true}

	if got := archive.UntilMilliseconds(); got != startMilliseconds {
		t.Errorf("until = %d, want the start %d", got, startMilliseconds)
	}
}

func TestSmallestOfNoItemsIsZero(t *testing.T) {
	stepOf := func(archive seriesDomain.Archive) int64 { return archive.StepMilliseconds }

	if got := seriesDomain.SmallestOf([]seriesDomain.Archive{}, stepOf); got != 0 {
		t.Errorf("smallest = %d, want 0", got)
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
