package infrastructure_test

import (
	"bytes"
	"context"
	"encoding/binary"
	"errors"
	"math"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	rrdDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/rrd/domain"
	rrdInfra "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/rrd/infrastructure"
)

var errNoSuchSource = errors.New("no such source")

// The layout rrdtool writes on a 64 bit little-endian machine, as far as inPlaceDatabase needs it.
const (
	statisticsHeaderSize   = 128
	definitionSize         = 120
	liveHeaderSize         = 16
	preparedDataSourceSize = 112
	preparedArchiveSize    = 80
	wordSize               = 8
	nameSize               = 20
	floatCookie            = 8.642135e130

	floatCookieOffset         = 16
	dataSourceCountOffset     = 24
	archiveCountOffset        = 32
	stepSecondsOffset         = 40
	archiveRowCountOffset     = 24
	archivePointsPerRowOffset = 32
)

// inPlaceDatabase is a database the parser reads without rrdtool: one data source and one archive
// of one row.
func inPlaceDatabase() []byte {
	dataSource := statisticsHeaderSize
	archive := dataSource + definitionSize
	lastUpdate := archive + definitionSize
	rowPointer := lastUpdate + liveHeaderSize + preparedDataSourceSize + preparedArchiveSize
	row := rowPointer + wordSize

	content := make([]byte, row+wordSize)
	copy(content, "RRD\x000003\x00")
	binary.LittleEndian.PutUint64(content[floatCookieOffset:], math.Float64bits(floatCookie))
	binary.LittleEndian.PutUint64(content[dataSourceCountOffset:], 1)
	binary.LittleEndian.PutUint64(content[archiveCountOffset:], 1)
	binary.LittleEndian.PutUint64(content[stepSecondsOffset:], 300)
	copy(content[dataSource:], "value")
	copy(content[dataSource+nameSize:], "GAUGE")
	copy(content[archive:], "AVERAGE")
	binary.LittleEndian.PutUint64(content[archive+archiveRowCountOffset:], 1)
	binary.LittleEndian.PutUint64(content[archive+archivePointsPerRowOffset:], 1)
	binary.LittleEndian.PutUint64(content[lastUpdate:], 3000)
	binary.LittleEndian.PutUint64(content[row:], math.Float64bits(1))

	return content
}

type fixedContents map[string][]byte

func (contents fixedContents) Read(_ context.Context, path string) ([]byte, error) {
	content, found := contents[path]
	if !found {
		return nil, errNoSuchSource
	}

	return content, nil
}

func TestDumpReaderOverContentsHandsAnXMLDumpOverAsItIs(t *testing.T) {
	reader := rrdInfra.NewDumpReaderOver(fixedContents{"memory:/1/cpu.xml": []byte(oneSourceDump)})

	dump, err := reader.ReadDump(context.Background(), "memory:/1/cpu.xml")
	if err != nil {
		t.Fatalf("read dump: %v", err)
	}

	if string(dump) != oneSourceDump {
		t.Fatalf("want the dump as it was kept, got %q", dump)
	}
}

func TestDumpReaderOverContentsFails(t *testing.T) {
	tests := []struct {
		name    string
		give    fixedContents
		path    string
		wantErr error
	}{
		{name: "source it does not hold", give: fixedContents{}, path: "memory:/1/gone.rrd", wantErr: rrdDomain.ErrUnreadableSource},
		{name: "neither a database nor a dump", give: fixedContents{"memory:/1/notes.rrd": []byte("plain text")}, path: "memory:/1/notes.rrd", wantErr: rrdDomain.ErrNotAnRRDDump},
		{
			name:    "binary layout only rrdtool could read",
			give:    fixedContents{"memory:/1/old.rrd": []byte("RRD\x00a layout this build does not read in place")},
			path:    "memory:/1/old.rrd",
			wantErr: rrdDomain.ErrUnreadableLayout,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := rrdInfra.NewDumpReaderOver(tt.give).ReadDump(context.Background(), tt.path)

			if !errors.Is(err, tt.wantErr) {
				t.Fatalf("want %v, got %v", tt.wantErr, err)
			}
		})
	}
}

func TestDumpReaderOverContentsHandsADatabaseItReadsInPlaceOverAsItIs(t *testing.T) {
	database := inPlaceDatabase()

	dump, err := rrdInfra.NewDumpReaderOver(fixedContents{"memory:/1/cpu.rrd": database}).ReadDump(context.Background(), "memory:/1/cpu.rrd")
	if err != nil {
		t.Fatalf("read dump: %v", err)
	}

	if !bytes.Equal(dump, database) {
		t.Fatalf("want the database as it was kept, got %d bytes", len(dump))
	}
}

func TestNewDumpReaderOverNoContentsPanicsNamingTheWire(t *testing.T) {
	defer func() {
		recovered := recover()
		if message, isText := recovered.(string); !isText || !strings.Contains(message, "SourceContents") {
			t.Errorf("panic = %v, want a message naming the SourceContents", recovered)
		}
	}()

	rrdInfra.NewDumpReaderOver(nil)
}

func TestNewDumpReaderAsksTheRRDToolOnThePathForALayoutItCannotReadInPlace(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("the stand-in rrdtool is a shell script")
	}

	directory := t.TempDir()
	if err := os.WriteFile(filepath.Join(directory, "rrdtool"), []byte("#!/bin/sh\nprintf 'dumped by rrdtool'\n"), 0o700); err != nil {
		t.Fatalf("write stand-in tool: %v", err)
	}

	source := filepath.Join(directory, "old.rrd")
	if err := os.WriteFile(source, []byte("RRD\x00a layout this build does not read in place"), 0o600); err != nil {
		t.Fatalf("write source: %v", err)
	}

	t.Setenv("PATH", directory)

	dump, err := rrdInfra.NewDumpReader().ReadDump(context.Background(), source)
	if err != nil {
		t.Fatalf("read dump: %v", err)
	}

	if string(dump) != "dumped by rrdtool" {
		t.Errorf("dump = %q, want what the rrdtool on the path wrote", dump)
	}
}
