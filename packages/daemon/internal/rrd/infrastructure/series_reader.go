package infrastructure

import (
	"context"
	"fmt"

	rrdDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/rrd/domain"
	rrdUsecase "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/rrd/usecase"
	seriesDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/series/domain"
)

// SeriesReader is an RRD source on disk turned into the series it holds: the dump the DumpReader
// hands over, parsed. It is the whole of what another domain needs from this one.
type SeriesReader struct {
	dumps rrdDomain.DumpReader
}

func NewSeriesReader(dumps rrdDomain.DumpReader) *SeriesReader {
	if dumps == nil {
		panic("rrd series reader: a DumpReader is required")
	}

	return &SeriesReader{dumps: dumps}
}

func (reader *SeriesReader) ReadSeries(callerContext context.Context, path string) ([]seriesDomain.Series, error) {
	dump, err := reader.dumps.ReadDump(callerContext, path)
	if err != nil {
		return nil, err
	}

	series, err := rrdUsecase.ParseDump(dump, path)
	if err != nil {
		return nil, fmt.Errorf("parse %q: %w", path, err)
	}

	return series, nil
}
