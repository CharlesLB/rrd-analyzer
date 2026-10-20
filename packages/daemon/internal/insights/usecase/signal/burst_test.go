package signal_test

import (
	"testing"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/usecase/signal"
)

func TestBursts_OnsetsCloseTogether_MergeIntoOneEpisodeCountingThem(t *testing.T) {
	onsets := []int{60, 0, 16, 4, 105, 8, 24, 100}
	episodes := make([]signal.Episode, 0, len(onsets))

	for _, onset := range onsets {
		episodes = append(episodes, signal.Episode{Onset: onset, End: onset + 1, From: onset, Until: onset + 1, Base: float64(onset), Peak: float64(onset + 1)})
	}

	got := signal.Bursts(episodes, 3, 10)

	if len(got) != 1 {
		t.Fatalf("Bursts = %+v, want one burst: 100 and 105 are only two", got)
	}

	burst := got[0]
	if spanOf(burst) != (span{onset: 0, end: 25, from: 0, until: 25}) || burst.Count != 5 || burst.Base != 0 || burst.Peak != 25 || !burst.Pronounced {
		t.Errorf("burst = %+v, want 0..25 holding five episodes from 0 to 25", burst)
	}
}
