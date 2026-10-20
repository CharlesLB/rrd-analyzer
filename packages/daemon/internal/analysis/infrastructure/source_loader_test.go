package infrastructure_test

import (
	"context"
	"errors"
	"fmt"
	"runtime"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	analysisDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/analysis/domain"
	analysisInfra "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/analysis/infrastructure"
	seriesDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/series/domain"
)

type refusingSeriesReader struct{}

func (reader refusingSeriesReader) ReadSeries(context.Context, string) ([]seriesDomain.Series, error) {
	return nil, errors.New("the series reader should not be reached for a source with no path")
}

type countingSeriesReader struct{ reads int }

func (reader *countingSeriesReader) ReadSeries(context.Context, string) ([]seriesDomain.Series, error) {
	reader.reads++

	return nil, errors.New("the series reader should not be reached once the caller has gone")
}

func TestSourceLoaderReadsNothingOnceTheCallerHasGone(t *testing.T) {
	reader := &countingSeriesReader{}
	loader := analysisInfra.NewSourceLoader(reader)
	cancelled, cancel := context.WithCancel(context.Background())
	cancel()

	_, err := loader.Load(cancelled, []analysisDomain.SourceFile{{Name: "cpu.rrd", Path: "/data/cpu.rrd"}})

	if !errors.Is(err, context.Canceled) {
		t.Fatalf("want context.Canceled, got %v", err)
	}

	if reader.reads != 0 {
		t.Fatalf("series reader called %d times, want none", reader.reads)
	}
}

func TestSourceLoaderNamesTheSourceThatHasNoPath(t *testing.T) {
	loader := analysisInfra.NewSourceLoader(refusingSeriesReader{})

	_, err := loader.Load(context.Background(), []analysisDomain.SourceFile{{Name: "atlas_http_latency_p95.rrd"}})

	if !errors.Is(err, analysisDomain.ErrSourceUnlocated) {
		t.Fatalf("want ErrSourceUnlocated, got %v", err)
	}
}

const (
	concurrentReadPatience = 5 * time.Second
	sourceCount            = 40
)

func sourcesNumbered(count int) []analysisDomain.SourceFile {
	files := make([]analysisDomain.SourceFile, 0, count)
	for number := range count {
		files = append(files, analysisDomain.SourceFile{Name: fmt.Sprintf("host%02d.rrd", number), Path: fmt.Sprintf("/data/host%02d.rrd", number)})
	}

	return files
}

func needsTwoWorkers(t *testing.T) {
	t.Helper()

	if runtime.GOMAXPROCS(0) < 2 {
		t.Skip("the loader reads with one worker per processor, and this machine offers one")
	}
}

// meetingSeriesReader holds every read until a second one is under way beside it, which a loader
// reading one file after another never provides, and counts how many it ever held at once. Each
// file holds two series named after it.
type meetingSeriesReader struct {
	mutex    sync.Mutex
	underWay int
	most     int
	met      chan struct{}
	meetOnce sync.Once
}

func (reader *meetingSeriesReader) ReadSeries(callerContext context.Context, path string) ([]seriesDomain.Series, error) {
	reader.mutex.Lock()
	reader.underWay++
	reader.most = max(reader.most, reader.underWay)
	if reader.underWay > 1 {
		reader.meetOnce.Do(func() { close(reader.met) })
	}
	reader.mutex.Unlock()

	defer func() {
		reader.mutex.Lock()
		reader.underWay--
		reader.mutex.Unlock()
	}()

	select {
	case <-reader.met:
	case <-callerContext.Done():
		return nil, callerContext.Err()
	case <-time.After(concurrentReadPatience):
		return nil, errors.New("no other source was read alongside this one")
	}

	return []seriesDomain.Series{{Name: path + "#a"}, {Name: path + "#b"}}, nil
}

func TestSourceLoader_SeveralFiles_AreReadSideBySideAndHandedBackInTheOrderListed(t *testing.T) {
	needsTwoWorkers(t)

	reader := &meetingSeriesReader{met: make(chan struct{})}
	files := sourcesNumbered(sourceCount)

	loaded, err := analysisInfra.NewSourceLoader(reader).Load(context.Background(), files)
	if err != nil {
		t.Fatalf("load: %v", err)
	}

	if len(loaded) != 2*sourceCount {
		t.Fatalf("loaded %d series, want two for each of the %d files", len(loaded), sourceCount)
	}

	for position, file := range files {
		if loaded[2*position].Name != file.Path+"#a" || loaded[2*position+1].Name != file.Path+"#b" {
			t.Fatalf("series %d and %d are %q and %q, want the two of %q in the order the file holds them", 2*position, 2*position+1, loaded[2*position].Name, loaded[2*position+1].Name, file.Path)
		}
	}

	if reader.most > 8 {
		t.Errorf("%d sources were held at once, want the reads bounded at 8", reader.most)
	}
}

// failingSeriesReader fails one file at once and holds every other read until its context ends.
type failingSeriesReader struct {
	failingPath string
	stopped     atomic.Int32
}

var errCorruptSource = errors.New("corrupt source")

func (reader *failingSeriesReader) ReadSeries(callerContext context.Context, path string) ([]seriesDomain.Series, error) {
	if path == reader.failingPath {
		return nil, errCorruptSource
	}

	select {
	case <-callerContext.Done():
		reader.stopped.Add(1)

		return nil, callerContext.Err()
	case <-time.After(concurrentReadPatience):
		return nil, errors.New("the read was left running after another source had failed")
	}
}

func TestSourceLoader_OneFileThatCannotBeRead_StopsTheOthersAndIsTheOneNamed(t *testing.T) {
	needsTwoWorkers(t)

	// The second file fails while the first is still being read, so the first is stopped and its
	// cancellation sits ahead of the real failure in the order the files are listed.
	files := sourcesNumbered(sourceCount)
	reader := &failingSeriesReader{failingPath: files[1].Path}

	_, err := analysisInfra.NewSourceLoader(reader).Load(context.Background(), files)

	if !errors.Is(err, errCorruptSource) {
		t.Fatalf("err = %v, want the failure of the file that could not be read, not the cancellation of the others", err)
	}
}

func TestSourceLoader_TheCallerLeavingMidway_EndsEveryReadUnderWay(t *testing.T) {
	reader := &failingSeriesReader{}
	leaving, leave := context.WithCancel(context.Background())
	time.AfterFunc(20*time.Millisecond, leave)

	_, err := analysisInfra.NewSourceLoader(reader).Load(leaving, sourcesNumbered(sourceCount))

	if !errors.Is(err, context.Canceled) {
		t.Fatalf("err = %v, want %v", err, context.Canceled)
	}
}
