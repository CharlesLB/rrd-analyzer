package usecase_test

import (
	"encoding/binary"
	"errors"
	"math"
	"testing"

	rrdDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/rrd/domain"
	rrdUsecase "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/rrd/usecase"
	seriesDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/series/domain"
)

const (
	headerSize             = 128
	dataSourceSize         = 120
	archiveSize            = 120
	liveHeaderSize         = 16
	preparedDataSourceSize = 112
	preparedArchiveSize    = 80
	pointerSize            = 8
	wordSize               = 8
	nameSize               = 20
	realFloatCookie        = 8.642135e130

	versionOffset             = 4
	dataSourceCountOffset     = 24
	archiveCountOffset        = 32
	archivePointsPerRowOffset = 32

	// pastAnyCount and pastAnyInstant are each one past the largest count and instant the decoder
	// will trust out of a header.
	pastAnyCount   = 1<<20 + 1
	pastAnyInstant = 1<<40 + 1
)

type archiveFixture struct {
	function     string
	pointsPerRow int64
	currentRow   int
	rows         [][]float64
}

// databaseOf writes the bytes rrdtool itself writes on a 64 bit little-endian machine, so the
// decoder is exercised against the layout rather than against a mirror of its own assumptions.
func databaseOf(step, lastUpdate int64, names []string, types []string, archives []archiveFixture) []byte {
	sources := len(names)

	rows := 0
	for _, archive := range archives {
		rows += len(archive.rows)
	}
	dataOffset := headerSize + sources*dataSourceSize + len(archives)*archiveSize + liveHeaderSize +
		sources*preparedDataSourceSize + len(archives)*sources*preparedArchiveSize + len(archives)*pointerSize

	content := make([]byte, dataOffset+rows*sources*wordSize)

	copy(content, "RRD\x00")
	copy(content[4:], "0003\x00")
	putFloat(content, 16, realFloatCookie)
	putWord(content, 24, uint64(sources))
	putWord(content, 32, uint64(len(archives)))
	putWord(content, 40, uint64(step))

	offset := headerSize
	for index, name := range names {
		copy(content[offset+index*dataSourceSize:], name)
		copy(content[offset+index*dataSourceSize+nameSize:], types[index])
	}

	offset += sources * dataSourceSize
	for index, archive := range archives {
		base := offset + index*archiveSize
		copy(content[base:], archive.function)
		putWord(content, base+24, uint64(len(archive.rows)))
		putWord(content, base+32, uint64(archive.pointsPerRow))
	}

	offset += len(archives) * archiveSize
	putWord(content, offset, uint64(lastUpdate))
	offset += liveHeaderSize + sources*preparedDataSourceSize + len(archives)*sources*preparedArchiveSize

	for index, archive := range archives {
		putWord(content, offset+index*pointerSize, uint64(archive.currentRow))
	}

	offset += len(archives) * pointerSize
	for _, archive := range archives {
		for rowIndex, row := range archive.rows {
			for column, value := range row {
				putFloat(content, offset+(rowIndex*sources+column)*wordSize, value)
			}
		}

		offset += len(archive.rows) * sources * wordSize
	}

	return content
}

func putWord(content []byte, offset int, value uint64) {
	binary.LittleEndian.PutUint64(content[offset:], value)
}

func putFloat(content []byte, offset int, value float64) {
	putWord(content, offset, math.Float64bits(value))
}

// The rows on disk start wherever the writer last stopped, so a database whose pointer sits in
// the middle of the ring is the only one that proves the rows come back in the right order.
func TestDecodeBinaryUnrollsTheRingFromTheCurrentRow(t *testing.T) {
	content := databaseOf(300, 3000, []string{"value"}, []string{"GAUGE"}, []archiveFixture{
		{function: "AVERAGE", pointsPerRow: 1, currentRow: 1, rows: [][]float64{{30}, {40}, {10}, {20}}},
	})

	database, err := rrdUsecase.DecodeBinary(content, "/sources/ring.rrd")
	if err != nil {
		t.Fatalf("decode: %v", err)
	}

	want := []float64{10, 20, 30, 40}
	for index, expected := range want {
		if got := database.Archives[0].ValueAt(index, 0, 1); got != expected {
			t.Errorf("row %d = %v, want %v", index, got, expected)
		}
	}
}

func TestDecodeBinaryReadsEveryDataSourceAndArchive(t *testing.T) {
	content := databaseOf(60, 6000, []string{"inbound", "outbound"}, []string{"GAUGE", "COUNTER"}, []archiveFixture{
		{function: "AVERAGE", pointsPerRow: 1, currentRow: 1, rows: [][]float64{{3, 30}, {4, 40}, {1, 10}, {2, 20}}},
		{function: "MAX", pointsPerRow: 5, currentRow: 1, rows: [][]float64{{7, 70}, {6, 60}}},
	})

	database, err := rrdUsecase.DecodeBinary(content, "/sources/pair.rrd")
	if err != nil {
		t.Fatalf("decode: %v", err)
	}

	if database.StepSeconds != 60 || database.LastUpdateSeconds != 6000 {
		t.Errorf("step %d lastupdate %d, want 60/6000", database.StepSeconds, database.LastUpdateSeconds)
	}

	if database.DataSources[0].Name != "inbound" || database.DataSources[1].Type != "COUNTER" {
		t.Errorf("data sources = %+v", database.DataSources)
	}

	if database.Archives[1].Function != "MAX" || database.Archives[1].PrimaryPointsPerRow != 5 {
		t.Errorf("second archive = %+v", database.Archives[1])
	}

	if got := database.Archives[0].ValueAt(0, 1, 2); got != 10 {
		t.Errorf("outbound row 0 = %v, want 10", got)
	}
}

func TestDecodeBinaryReadsTheMaximumAfterTheHeartbeatAndTheMinimum(t *testing.T) {
	content := databaseOf(60, 6000, []string{"used", "free"}, []string{"GAUGE", "GAUGE"}, []archiveFixture{
		{function: "AVERAGE", pointsPerRow: 1, rows: [][]float64{{40, 60}, {45, 55}}},
	})
	for index, maximum := range []float64{100, math.NaN()} {
		base := headerSize + index*dataSourceSize + 2*nameSize
		putWord(content, base, 120)
		putFloat(content, base+wordSize, 0)
		putFloat(content, base+2*wordSize, maximum)
	}

	database, err := rrdUsecase.DecodeBinary(content, "/sources/memory.rrd")
	if err != nil {
		t.Fatalf("decode: %v", err)
	}

	if got := database.DataSources[0].Maximum; got != 100 {
		t.Errorf("used maximum = %v, want 100", got)
	}
	if got := database.DataSources[1].Maximum; !math.IsNaN(got) {
		t.Errorf("free maximum = %v, want NaN for a data source created without one", got)
	}
}

func TestDecodeBinaryKeepsAnUnwrittenRowUnknown(t *testing.T) {
	content := databaseOf(300, 3000, []string{"value"}, []string{"GAUGE"}, []archiveFixture{
		{function: "AVERAGE", pointsPerRow: 1, currentRow: 2, rows: [][]float64{{math.NaN()}, {math.NaN()}, {5}}},
	})

	database, err := rrdUsecase.DecodeBinary(content, "/sources/fresh.rrd")
	if err != nil {
		t.Fatalf("decode: %v", err)
	}

	if !math.IsNaN(database.Archives[0].ValueAt(0, 0, 1)) || !math.IsNaN(database.Archives[0].ValueAt(1, 0, 1)) {
		t.Error("want the rows the writer has not reached yet to stay unknown")
	}

	if got := database.Archives[0].ValueAt(2, 0, 1); got != 5 {
		t.Errorf("newest row = %v, want the one reading that was written", got)
	}
}

func TestCanDecodeBinaryRefusesWhatThisBuildWouldMisread(t *testing.T) {
	sound := databaseOf(300, 3000, []string{"value"}, []string{"GAUGE"}, []archiveFixture{
		{function: "AVERAGE", pointsPerRow: 1, currentRow: 0, rows: [][]float64{{1}, {2}}},
	})

	if !rrdUsecase.CanDecodeBinary(sound) {
		t.Fatal("want a plain 64 bit little-endian database to be readable in place")
	}

	tests := []struct {
		name    string
		corrupt func(content []byte)
	}{
		{name: "written by another word size or byte order", corrupt: func(content []byte) { putFloat(content, 16, 1) }},
		{name: "an older format version", corrupt: func(content []byte) { copy(content[4:], "0002\x00") }},
		{name: "no data sources", corrupt: func(content []byte) { putWord(content, 24, 0) }},
		{name: "a row pointer outside the ring", corrupt: func(content []byte) { putWord(content, len(content)-2*wordSize-8, 99) }},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			content := append([]byte(nil), sound...)
			tt.corrupt(content)

			if rrdUsecase.CanDecodeBinary(content) {
				t.Error("want the decoder to stand aside so rrdtool can be asked instead")
			}
		})
	}

	if rrdUsecase.CanDecodeBinary(sound[:len(sound)-wordSize]) {
		t.Error("want a truncated database to be refused")
	}
}

func TestParseDumpReadsABinaryDatabaseWithoutRrdtool(t *testing.T) {
	content := databaseOf(60, 6000, []string{"value"}, []string{"ABSOLUTE"}, []archiveFixture{
		{function: "AVERAGE", pointsPerRow: 1, currentRow: 1, rows: [][]float64{{3}, {4}, {1}, {2}}},
		{function: "MAX", pointsPerRow: 2, currentRow: 0, rows: [][]float64{{9}, {8}}},
	})

	parsed, err := rrdUsecase.ParseDump(content, "/sources/atlas_disk_reads.rrd")
	if err != nil {
		t.Fatalf("parse binary database: %v", err)
	}

	if len(parsed) != 1 {
		t.Fatalf("want one series, got %d", len(parsed))
	}

	series := parsed[0]
	if series.Name != "atlas_disk_reads" || series.Unit != "/s" {
		t.Errorf("name %q unit %q, want atlas_disk_reads and /s", series.Name, series.Unit)
	}

	if series.StepMilliseconds != 60*1000 {
		t.Errorf("step = %d, want the finest archive at 60000", series.StepMilliseconds)
	}

	assertSamples(t, "AVERAGE", archiveOf(t, series, seriesDomain.ConsolidationAverage, 60*1000).Samples, []float64{1, 2, 3, 4})
	assertSamples(t, "MAX", archiveOf(t, series, seriesDomain.ConsolidationMaximum, 120*1000).Samples, []float64{8, 9})
}

// A binary database can hold an infinite reading where an XML dump could not; kept, it would turn
// the statistics of every window over it infinite and fail the chart's JSON.
func TestParseDumpReadsAnInfiniteBinaryReadingAsUnknown(t *testing.T) {
	content := databaseOf(60, 6000, []string{"value"}, []string{"GAUGE"}, []archiveFixture{
		{function: "AVERAGE", pointsPerRow: 1, currentRow: 2, rows: [][]float64{{1}, {math.Inf(1)}, {math.Inf(-1)}}},
	})

	parsed, err := rrdUsecase.ParseDump(content, "/sources/atlas_load.rrd")
	if err != nil {
		t.Fatalf("parse binary database: %v", err)
	}

	samples := archiveOf(t, parsed[0], seriesDomain.ConsolidationAverage, 60*1000).Samples
	if !samples[0].Present || samples[0].Value != 1 || samples[1].Present || samples[2].Present {
		t.Errorf("samples = %+v, want 1 then two unknown readings", samples)
	}
}

func TestDecodeBinaryRefusesALayoutItCannotTrust(t *testing.T) {
	oneArchive := []archiveFixture{{function: "AVERAGE", pointsPerRow: 1, rows: [][]float64{{1}, {2}}}}
	sound := databaseOf(300, 3000, []string{"value"}, []string{"GAUGE"}, oneArchive)
	firstArchive := headerSize + dataSourceSize
	lastUpdate := firstArchive + archiveSize

	corrupted := func(corrupt func(content []byte)) []byte {
		content := append([]byte(nil), sound...)
		corrupt(content)

		return content
	}

	withoutRows := databaseOf(300, 3000, []string{"value"}, []string{"GAUGE"}, []archiveFixture{{function: "AVERAGE", pointsPerRow: 1}})

	tests := []struct {
		name string
		give []byte
	}{
		{name: "not a database at all", give: []byte("plain text")},
		{name: "a byte past what the header describes", give: append(append([]byte(nil), sound...), 0)},
		{name: "more data sources than the file holds", give: corrupted(func(content []byte) { putWord(content, dataSourceCountOffset, 1000) })},
		{name: "more archives than the file holds", give: corrupted(func(content []byte) { putWord(content, archiveCountOffset, 1000) })},
		{name: "a data source count past any database", give: corrupted(func(content []byte) { putWord(content, dataSourceCountOffset, pastAnyCount) })},
		{name: "a last update past any instant", give: corrupted(func(content []byte) { putWord(content, lastUpdate, pastAnyInstant) })},
		{name: "an archive consolidating no points per row", give: corrupted(func(content []byte) { putWord(content, firstArchive+archivePointsPerRowOffset, 0) })},
		{name: "a version spelled with a letter", give: corrupted(func(content []byte) { copy(content[versionOffset:], "00a3\x00") })},
		{name: "row pointers cut short", give: withoutRows[:len(withoutRows)-1]},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := rrdUsecase.DecodeBinary(tt.give, "/sources/hostile.rrd")

			if !errors.Is(err, rrdDomain.ErrUnreadableLayout) {
				t.Fatalf("err = %v, want %v", err, rrdDomain.ErrUnreadableLayout)
			}
		})
	}
}
