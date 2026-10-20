package signal_test

import (
	"math"
	"testing"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/domain"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/usecase/signal"
)

// spikeSamples is long enough for a spike of a sample or two to be rare in it. In a series that is
// otherwise perfectly still the noise is taken from how often it departs, so two samples in twenty
// would be a tenth of the data and no spike at all.
const (
	spikeSamples    = 120
	lastSpikeSample = spikeSamples - 1
)

func spikeValues(spikes map[int]float64) []float64 {
	values := stepValues(spikeSamples, 0, 1, 1)
	for index, value := range spikes {
		values[index] = value
	}

	return values
}

func TestSpikes_ShortExcursionsThatReturn_AreEpisodes(t *testing.T) {
	tests := []struct {
		name       string
		give       []float64
		parameters signal.SpikeParameters
		want       []span
		wantBase   float64
		wantPeak   float64
	}{
		{name: "two-sample spike over the robust bar", give: spikeValues(map[int]float64{10: 50, 11: 40}), parameters: signal.SpikeParameters{Theta: 5, MaximumSamples: 3},
			want: []span{{onset: 10, end: 11, from: 10, until: 11}}, wantBase: 1, wantPeak: 50},
		{name: "explicit level", give: spikeValues(map[int]float64{10: 50, 11: 40}), parameters: signal.SpikeParameters{Level: pointer(45), Theta: 5, MaximumSamples: 3},
			want: []span{{onset: 10, end: 10, from: 10, until: 10}}, wantBase: 1, wantPeak: 50},
		{name: "spike on the first sample", give: spikeValues(map[int]float64{0: 50}), parameters: signal.SpikeParameters{Theta: 5, MaximumSamples: 3},
			want: []span{{onset: 0, end: 0, from: 0, until: 0}}, wantBase: 1, wantPeak: 50},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := signal.Spikes(tt.give, signal.Range{From: 0, Until: lastSpikeSample}, tt.parameters)
			if len(got) != len(tt.want) {
				t.Fatalf("Spikes = %+v, want %+v", got, tt.want)
			}

			if spanOf(got[0]) != tt.want[0] || got[0].Base != tt.wantBase || got[0].Peak != tt.wantPeak || got[0].Direction != domain.DirectionRising {
				t.Errorf("Spikes = %+v, want %+v from %v to %v", got[0], tt.want[0], tt.wantBase, tt.wantPeak)
			}
		})
	}
}

func TestSpikes_PlateausUnreturnedOrEmpty_AreNotSpikes(t *testing.T) {
	plateau := spikeValues(map[int]float64{10: 50, 11: 50, 12: 50, 13: 50, 14: 50, 15: 50})

	tests := []struct {
		name     string
		give     []float64
		searched signal.Range
	}{
		{name: "plateau longer than the maximum", give: plateau, searched: signal.Range{From: 0, Until: lastSpikeSample}},
		{name: "still above at the range end", give: spikeValues(map[int]float64{lastSpikeSample: 50}), searched: signal.Range{From: 0, Until: lastSpikeSample}},
		{name: "all holes", give: holes(spikeSamples), searched: signal.Range{From: 0, Until: lastSpikeSample}},
		{name: "outside the slice", give: plateau, searched: signal.Range{From: spikeSamples + 5, Until: spikeSamples + 10}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := signal.Spikes(tt.give, tt.searched, signal.SpikeParameters{Theta: 5, MaximumSamples: 3}); len(got) != 0 {
				t.Errorf("Spikes = %+v, want nothing", got)
			}
		})
	}
}

func TestSpikes_SeriesOfZerosAndOnes_HoldsNoSpikeUntilSomethingStandsOutOfIt(t *testing.T) {
	values := make([]float64, 400)
	for index := range values {
		if index%7 == 3 {
			values[index] = 1
		}
	}

	searched := signal.Range{From: 0, Until: 399}
	parameters := signal.SpikeParameters{Theta: 5, MaximumSamples: 3}

	if got := signal.Spikes(values, searched, parameters); len(got) != 0 {
		t.Fatalf("Spikes = %d episodes, want none: a one every seventh sample is what the series does", len(got))
	}

	values[200] = 50

	got := signal.Spikes(values, searched, parameters)
	if len(got) != 1 || got[0].From != 200 || !got[0].Pronounced || math.IsInf(got[0].Magnitude, 0) {
		t.Errorf("Spikes = %+v, want the one reading of 50, pronounced by a finite magnitude", got)
	}
}
