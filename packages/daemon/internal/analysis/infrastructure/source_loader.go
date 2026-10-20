// Package infrastructure loads an analysis' series from the RRD files it names, describes the files
// a person chose, and keeps the library of analyses: in SQLite on disk, or in memory for the browser
// edition, whose js build leaves the SQLite files out.
package infrastructure

import (
	"context"
	"errors"
	"fmt"
	"runtime"
	"sync"

	analysisDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/analysis/domain"
	seriesDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/series/domain"
)

// maximumConcurrentReads caps how many sources are read at once whatever the machine offers. Each
// read holds a whole file and the rows parsed out of it until it is done, so the cap is what keeps an
// analysis of a hundred files from holding a hundred of them in memory at the same moment.
const maximumConcurrentReads = 8

type SourceLoader struct {
	reader analysisDomain.SeriesReader
}

func NewSourceLoader(reader analysisDomain.SeriesReader) *SourceLoader {
	if reader == nil {
		panic("analysis source loader: a SeriesReader is required")
	}

	return &SourceLoader{reader: reader}
}

// Load reads the files side by side, since one file's series owe nothing to another's, and hands
// the series back in the order the files were listed whatever order the reads finished in: a
// series is named by its position, and a stored canvas points at those names.
func (loader *SourceLoader) Load(callerContext context.Context, files []analysisDomain.SourceFile) ([]seriesDomain.Series, error) {
	if err := callerContext.Err(); err != nil {
		return nil, fmt.Errorf("load sources: %w", err)
	}

	// A source picked in a browser carries a name and no path, so an analysis created outside
	// the desktop window names files this loader can never open. Saying that is far more use
	// than the empty-path read error it would otherwise become, and it is said before any file
	// is read.
	for _, file := range files {
		if file.Path == "" {
			return nil, fmt.Errorf("read source %q: %w", file.Name, analysisDomain.ErrSourceUnlocated)
		}
	}

	read := loader.readEach(callerContext, files)

	if err := callerContext.Err(); err != nil {
		return nil, fmt.Errorf("load sources: %w", err)
	}

	if err := read.failure(files); err != nil {
		return nil, err
	}

	return read.inOrder(), nil
}

// fileReads is what reading each file came to, at the position of the file. Every slot is written
// by the one worker that read that file, which is what lets the workers share it without a lock.
type fileReads struct {
	series   [][]seriesDomain.Series
	failures []error
}

// readEach reads every file through a fixed number of workers. The first read to fail stops the
// ones not yet finished: the analysis cannot open without that file, so reading the rest is wasted.
func (loader *SourceLoader) readEach(callerContext context.Context, files []analysisDomain.SourceFile) fileReads {
	read := fileReads{series: make([][]seriesDomain.Series, len(files)), failures: make([]error, len(files))}

	readContext, stop := context.WithCancel(callerContext)
	defer stop()

	positions := make(chan int)

	var workers sync.WaitGroup

	for range min(len(files), runtime.GOMAXPROCS(0), maximumConcurrentReads) {
		workers.Go(func() {
			for position := range positions {
				if err := readContext.Err(); err != nil {
					read.failures[position] = err

					continue
				}

				parsed, err := loader.reader.ReadSeries(readContext, files[position].Path)
				if err != nil {
					read.failures[position] = err

					stop()

					continue
				}

				read.series[position] = parsed
			}
		})
	}

	// The workers keep taking positions after a failure and only skip the read, so this never
	// waits on a worker that has gone.
	for position := range files {
		positions <- position
	}

	close(positions)
	workers.Wait()

	return read
}

// failure is the error of the first file, in the order listed, whose own read failed. A file
// stopped because another one failed reports only that it was cancelled, which says nothing a
// person can act on, so it is passed over for the failure that caused it.
func (read fileReads) failure(files []analysisDomain.SourceFile) error {
	for position, err := range read.failures {
		if err != nil && !errors.Is(err, context.Canceled) {
			return fmt.Errorf("read source %q: %w", files[position].Name, err)
		}
	}

	for position, err := range read.failures {
		if err != nil {
			return fmt.Errorf("read source %q: %w", files[position].Name, err)
		}
	}

	return nil
}

func (read fileReads) inOrder() []seriesDomain.Series {
	total := 0
	for _, parsed := range read.series {
		total += len(parsed)
	}

	out := make([]seriesDomain.Series, 0, total)
	for _, parsed := range read.series {
		out = append(out, parsed...)
	}

	return out
}
