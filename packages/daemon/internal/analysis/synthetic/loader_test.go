package synthetic_test

import (
	"context"
	"errors"
	"fmt"
	"testing"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/analysis/synthetic"
	seriesDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/series/domain"
)

var referenceProbes = map[string][]string{
	"atlas_runtime_goroutines":          {"1462.442565778", "1496.459568608", "1471.310342800", "1039.007827540", "1240.273852511", "1224.868211607", "1593.575389926", "1566.406092052", "1551.468744878"},
	"atlas_runtime_gc_pause":            {"3.018338179", "2.690256780", "2.605248817", "1.718609729", "1.413542578", "2.881332034", "6.702665598", "4.909294481", "2.319364813"},
	"atlas_runtime_heap_objects":        {"828819.271161749", "822931.012226555", "822825.316340087", "838331.384720579", "879266.224358925", "856748.987655476", "820726.254917316", "829308.226965018", "857770.878392756"},
	"atlas_system_cpu_user":             {"40.302732159", "40.696383681", "40.729251694", "26.807042495", "97.000000000", "30.401606450", "50.305017804", "56.558572450", "34.638571405"},
	"atlas_system_cpu_system":           {"12.370084787", "12.781081088", "13.319535510", "5.737311447", "12.212477733", "4.373178791", "16.320964756", "14.348071774", "12.994651222"},
	"atlas_system_memory_used":          {"3728462072.981055260", "3796861608.062819481", "3863502399.404434204", "3808770042.689677238", "4072502001.765206337", "4789813228.744047165", "null", "null", "5077353158.732283592"},
	"atlas_system_network_packets_sent": {"9616.887706917", "8915.047592709", "8078.701994528", "5634.077768761", "14552.165924578", "4561.272818083", "9067.409894056", "9910.549839120", "13286.081858282"},
	"atlas_system_network_packets_recv": {"12968.977648289", "12565.296704504", "11821.714246141", "7146.978845520", "7255.317153007", "9068.732001073", "10558.363862362", "9157.360033270", "14730.606324619"},
	"atlas_http_requests_rate":          {"729.588535217", "653.593253788", "659.067819124", "534.147906641", "522.755428582", "420.073031929", "581.537166642", "640.684964207", "412.380880409"},
	"atlas_http_latency_p95":            {"135.424611653", "144.548399948", "142.727651844", "115.767637906", "68.032406979", "170.625342328", "null", "null", "227.405811902"},
}

var probeIndexes = []int{0, 1, 2, 100, 3903, 5000, 5386, 5400, 8639}

func TestLoaderReproducesTheReferenceDataset(t *testing.T) {
	loaded, err := synthetic.NewLoader().Load(context.Background(), nil)
	if err != nil {
		t.Fatalf("load synthetic series: %v", err)
	}

	if len(loaded) != len(referenceProbes) {
		t.Fatalf("series count = %d, want %d", len(loaded), len(referenceProbes))
	}

	for _, series := range loaded {
		want, known := referenceProbes[series.Name]
		if !known {
			t.Errorf("unexpected series %q", series.Name)

			continue
		}

		samples := averageSamplesOf(series)
		if len(samples) != 8641 {
			t.Errorf("%s sample count = %d, want 8641", series.Name, len(samples))

			continue
		}

		for probe, index := range probeIndexes {
			got := "null"
			if samples[index].Present {
				got = fmt.Sprintf("%.9f", samples[index].Value)
			}

			if got != want[probe] {
				t.Errorf("%s[%d] = %s, want %s", series.Name, index, got, want[probe])
			}
		}
	}
}

func TestLoaderRenamesRootsAfterTheAnalysisFiles(t *testing.T) {
	loaded, err := synthetic.NewLoader().Load(context.Background(), []string{"atlas-prod.rrd", "replica.rrd"})
	if err != nil {
		t.Fatalf("load synthetic series: %v", err)
	}

	if loaded[0].Name != "atlas_prod_runtime_goroutines" {
		t.Errorf("first series = %q, want atlas_prod_runtime_goroutines", loaded[0].Name)
	}
	if loaded[len(loaded)-1].Name != "replica_http_latency_p95" {
		t.Errorf("last series = %q, want replica_http_latency_p95", loaded[len(loaded)-1].Name)
	}
}

func TestLoaderArchivesTheExtremesTheAverageSmoothsAway(t *testing.T) {
	loaded, err := synthetic.NewLoader().Load(context.Background(), nil)
	if err != nil {
		t.Fatalf("load synthetic series: %v", err)
	}

	series := loaded[0]
	average := averageSamplesOf(series)
	minimum := series.ArchivesFor(seriesDomain.ConsolidationMinimum)[0].Samples
	maximum := series.ArchivesFor(seriesDomain.ConsolidationMaximum)[0].Samples

	if len(minimum) != len(average) || len(maximum) != len(average) {
		t.Fatalf("archive lengths = %d/%d, want %d", len(minimum), len(maximum), len(average))
	}

	for index, reading := range average {
		if !reading.Present {
			continue
		}

		if !(minimum[index].Value < reading.Value && reading.Value < maximum[index].Value) {
			t.Fatalf("at %d: minimum %v is not below average %v is not below maximum %v",
				index, minimum[index].Value, reading.Value, maximum[index].Value)
		}
	}
}

func TestLoaderKeepsAGapInEveryArchive(t *testing.T) {
	loaded, err := synthetic.NewLoader().Load(context.Background(), nil)
	if err != nil {
		t.Fatalf("load synthetic series: %v", err)
	}

	for _, series := range loaded {
		average := averageSamplesOf(series)
		maximum := series.ArchivesFor(seriesDomain.ConsolidationMaximum)[0].Samples

		for index, reading := range average {
			if !reading.Present && maximum[index].Present {
				t.Fatalf("%s: gap at %d survives in the average but not in the maximum", series.Name, index)
			}
		}
	}
}

func averageSamplesOf(series seriesDomain.Series) []seriesDomain.Sample {
	return series.ArchivesFor(seriesDomain.ConsolidationAverage)[0].Samples
}

func TestLoader_ACallerThatHasGone_BuildsNothing(t *testing.T) {
	gone, leave := context.WithCancel(context.Background())
	leave()

	if _, err := synthetic.NewLoader().Load(gone, nil); !errors.Is(err, context.Canceled) {
		t.Fatalf("err = %v, want %v", err, context.Canceled)
	}
}

func TestLoader_OneFilePerMetric_NamesEachSeriesAfterItsFileAlone(t *testing.T) {
	fileNames := make([]string, 0, len(referenceProbes))
	for number := range len(referenceProbes) {
		fileNames = append(fileNames, fmt.Sprintf("host%02d.rrd", number))
	}

	loaded, err := synthetic.NewLoader().Load(context.Background(), fileNames)
	if err != nil {
		t.Fatalf("load synthetic series: %v", err)
	}

	for index, series := range loaded {
		if want := fmt.Sprintf("host%02d", index); series.Name != want || series.File != fileNames[index] {
			t.Errorf("series %d = %q from %q, want %q from %q", index, series.Name, series.File, want, fileNames[index])
		}
	}
}
