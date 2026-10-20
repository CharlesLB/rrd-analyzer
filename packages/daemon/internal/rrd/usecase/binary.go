package usecase

import (
	"bytes"
	"encoding/binary"
	"fmt"
	"math"

	rrdDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/rrd/domain"
)

// The layout below is rrdtool's own on-disk format for a database written by a 64 bit
// little-endian build: every count and offset is an 8 byte word and every struct is padded to an
// 8 byte boundary. The float cookie at offset 16 is what the format itself provides to prove the
// assumption: a database written with another word size or byte order does not read 8.642135e130
// there, and CanDecodeBinary rejects it so the caller can fall back to rrdtool.
const (
	binaryCookie      = "RRD\x00"
	binaryFloatCookie = 8.642135e130

	statisticsHeaderSize   = 128
	dataSourceSize         = 120
	archiveDefinitionSize  = 120
	liveHeaderSize         = 16
	preparedDataSourceSize = 112
	preparedArchiveSize    = 80
	archivePointerSize     = 8
	doubleSize             = 8
	nameSize               = 20

	// A data source definition is its name, its type, then ten parameter words: the minimal
	// heartbeat, the minimum and the maximum come first, in that order.
	dataSourceMaximumOffset = 2*nameSize + 2*doubleSize

	floatCookieOffset     = 16
	dataSourceCountOffset = 24
	archiveCountOffset    = 32
	stepSecondsOffset     = 40

	archiveRowCountOffset     = 24
	archivePointsPerRowOffset = 32

	oldestSupportedVersion = 3

	// Every count read out of the header is bounded before it is used, because the header of a
	// truncated or hostile file is just bytes: an unbounded row count would size an allocation
	// and an unbounded step would overflow the arithmetic that turns rows into instants. The
	// ceilings are far above anything rrdtool writes and far below where either goes wrong.
	maximumCount   = 1 << 20
	maximumSeconds = 1 << 24
	maximumInstant = 1 << 40
)

// binaryLayout is what the header says about a database: its step and last update, each data
// source, each archive, and where the rows start.
type binaryLayout struct {
	stepSeconds int64
	lastUpdate  int64
	dataSources []rrdDomain.DataSource
	archives    []archiveHeader
	dataOffset  int
	totalSize   int
}

// archiveHeader is one archive as the header describes it, with the row its ring was last written
// at, which says where its oldest row is.
type archiveHeader struct {
	function     string
	pointsPerRow int64
	rowCount     int
	currentRow   int
}

// headerCounts are the sizes the statistics header declares, read before anything they size.
type headerCounts struct {
	dataSources int
	archives    int
	stepSeconds int64
}

// CanDecodeBinary reports whether this build can read the database without rrdtool. It insists on
// the file being exactly the size its own header describes, which is the strongest evidence
// available that every offset below was interpreted the way the writer meant them.
func CanDecodeBinary(content []byte) bool {
	layout, err := layoutOf(content)

	return err == nil && layout.totalSize == len(content)
}

func IsBinaryDatabase(content []byte) bool {
	return bytes.HasPrefix(content, []byte(binaryCookie))
}

func DecodeBinary(content []byte, sourcePath string) (rrdDomain.Database, error) {
	layout, err := layoutOf(content)
	if err != nil {
		return rrdDomain.Database{}, fmt.Errorf("read rrd database %q: %w", sourcePath, err)
	}

	if layout.totalSize != len(content) {
		return rrdDomain.Database{}, fmt.Errorf("read rrd database %q: %w", sourcePath, rrdDomain.ErrUnreadableLayout)
	}

	return rrdDomain.Database{
		StepSeconds:       layout.stepSeconds,
		LastUpdateSeconds: layout.lastUpdate,
		DataSources:       layout.dataSources,
		Archives:          archivesOfBinary(content, layout),
	}, nil
}

// archivesOfBinary unrolls each ring. The rows on disk start wherever the writer last stopped, so
// the row after the current one is the oldest and the current one is the newest.
func archivesOfBinary(content []byte, layout binaryLayout) []rrdDomain.Archive {
	archives := make([]rrdDomain.Archive, 0, len(layout.archives))
	offset := layout.dataOffset
	width := len(layout.dataSources)

	for _, header := range layout.archives {
		rowCount := header.rowCount
		values := make([]float64, rowCount*width)

		oldest := 0
		if rowCount > 0 {
			oldest = (header.currentRow + 1) % rowCount
		}

		for row := range rowCount {
			stored := (oldest + row) % rowCount
			for column := range width {
				values[row*width+column] = readFloat(content, offset+(stored*width+column)*doubleSize)
			}
		}

		archives = append(archives, rrdDomain.Archive{
			Function:            header.function,
			PrimaryPointsPerRow: header.pointsPerRow,
			RowCount:            rowCount,
			Values:              values,
		})

		offset += rowCount * width * doubleSize
	}

	return archives
}

// layoutOf reads the header in the order rrdtool writes it: the counts and step, one definition per
// data source, one per archive, the last update, and after the prepared state the row each ring
// was last written at. Every phase checks the file is long enough before it reads.
func layoutOf(content []byte) (binaryLayout, error) {
	counts, err := countsOf(content)
	if err != nil {
		return binaryLayout{}, err
	}

	layout := binaryLayout{stepSeconds: counts.stepSeconds}
	offset := statisticsHeaderSize

	offset, err = layout.readDataSources(content, offset, counts.dataSources)
	if err != nil {
		return binaryLayout{}, err
	}

	offset, err = layout.readArchiveDefinitions(content, offset, counts.archives)
	if err != nil {
		return binaryLayout{}, err
	}

	lastUpdate, instantRead := readBounded(content, offset, maximumInstant)
	if !instantRead {
		return binaryLayout{}, rrdDomain.ErrUnreadableLayout
	}

	layout.lastUpdate = lastUpdate
	offset = layout.skipLiveAndPreparedState(offset)

	offset, err = layout.readCurrentRows(content, offset)
	if err != nil {
		return binaryLayout{}, err
	}

	layout.dataOffset = offset
	layout.totalSize = offset + layout.totalRows()*len(layout.dataSources)*doubleSize

	return layout, nil
}

func countsOf(content []byte) (headerCounts, error) {
	if !IsBinaryDatabase(content) || !fits(content, statisticsHeaderSize) {
		return headerCounts{}, rrdDomain.ErrUnreadableLayout
	}

	if readFloat(content, floatCookieOffset) != binaryFloatCookie {
		return headerCounts{}, rrdDomain.ErrUnreadableLayout
	}

	if versionOf(content) < oldestSupportedVersion {
		return headerCounts{}, rrdDomain.ErrUnreadableLayout
	}

	dataSourceCount, sourcesRead := readBounded(content, dataSourceCountOffset, maximumCount)
	archiveCount, archivesRead := readBounded(content, archiveCountOffset, maximumCount)
	stepSeconds, stepRead := readBounded(content, stepSecondsOffset, maximumSeconds)

	if !sourcesRead || !archivesRead || !stepRead || dataSourceCount == 0 || archiveCount == 0 || stepSeconds == 0 {
		return headerCounts{}, rrdDomain.ErrUnreadableLayout
	}

	return headerCounts{dataSources: int(dataSourceCount), archives: int(archiveCount), stepSeconds: stepSeconds}, nil
}

func (layout *binaryLayout) readDataSources(content []byte, offset, count int) (int, error) {
	if !fits(content, offset+count*dataSourceSize) {
		return 0, rrdDomain.ErrUnreadableLayout
	}

	layout.dataSources = make([]rrdDomain.DataSource, 0, count)
	for index := range count {
		base := offset + index*dataSourceSize
		layout.dataSources = append(layout.dataSources, rrdDomain.DataSource{
			Name:    readName(content, base),
			Type:    readName(content, base+nameSize),
			Maximum: readFloat(content, base+dataSourceMaximumOffset),
		})
	}

	return offset + count*dataSourceSize, nil
}

// readArchiveDefinitions checks there is room for the live header after the definitions too: the
// last update is read from it next.
func (layout *binaryLayout) readArchiveDefinitions(content []byte, offset, count int) (int, error) {
	if !fits(content, offset+count*archiveDefinitionSize+liveHeaderSize) {
		return 0, rrdDomain.ErrUnreadableLayout
	}

	layout.archives = make([]archiveHeader, 0, count)
	for index := range count {
		base := offset + index*archiveDefinitionSize
		rowCount, rowsRead := readBounded(content, base+archiveRowCountOffset, maximumCount)
		pointsPerRow, pointsRead := readBounded(content, base+archivePointsPerRowOffset, maximumSeconds)

		if !rowsRead || !pointsRead || pointsPerRow == 0 {
			return 0, rrdDomain.ErrUnreadableLayout
		}

		layout.archives = append(layout.archives, archiveHeader{function: readName(content, base), pointsPerRow: pointsPerRow, rowCount: int(rowCount)})
	}

	return offset + count*archiveDefinitionSize, nil
}

// skipLiveAndPreparedState steps over what rrdtool keeps between updates, from the offset of the
// live header: the live header itself, the state each data source was left in, and the state of
// each data source in each archive. None of it is a reading.
func (layout *binaryLayout) skipLiveAndPreparedState(offset int) int {
	dataSourceCount := len(layout.dataSources)

	return offset + liveHeaderSize + dataSourceCount*preparedDataSourceSize + len(layout.archives)*dataSourceCount*preparedArchiveSize
}

func (layout *binaryLayout) readCurrentRows(content []byte, offset int) (int, error) {
	if !fits(content, offset+len(layout.archives)*archivePointerSize) {
		return 0, rrdDomain.ErrUnreadableLayout
	}

	for index := range layout.archives {
		archive := &layout.archives[index]

		current, pointerRead := readBounded(content, offset+index*archivePointerSize, maximumCount)
		if !pointerRead || (archive.rowCount > 0 && int(current) >= archive.rowCount) {
			return 0, rrdDomain.ErrUnreadableLayout
		}

		archive.currentRow = int(current)
	}

	return offset + len(layout.archives)*archivePointerSize, nil
}

// totalRows is how many rows the archives hold together, which sizes the data after the header.
func (layout *binaryLayout) totalRows() int {
	rows := 0
	for _, archive := range layout.archives {
		rows += archive.rowCount
	}

	return rows
}

// readBounded refuses a value the rest of this file would then have to trust. Rejecting here is
// what lets every later multiplication and allocation be plain arithmetic.
func readBounded(content []byte, offset int, maximum uint64) (int64, bool) {
	value := readWord(content, offset)
	if value > maximum || value > math.MaxInt64 {
		return 0, false
	}

	return int64(value), true
}

func versionOf(content []byte) int {
	version := 0
	for _, character := range []byte(readName(content, len(binaryCookie))) {
		if character < '0' || character > '9' {
			return 0
		}

		version = version*10 + int(character-'0')
	}

	return version
}

func fits(content []byte, size int) bool {
	return size >= 0 && size <= len(content)
}

func readWord(content []byte, offset int) uint64 {
	return binary.LittleEndian.Uint64(content[offset : offset+doubleSize])
}

func readFloat(content []byte, offset int) float64 {
	return math.Float64frombits(readWord(content, offset))
}

func readName(content []byte, offset int) string {
	raw := content[offset : offset+nameSize]
	if end := bytes.IndexByte(raw, 0); end >= 0 {
		raw = raw[:end]
	}

	return string(raw)
}
