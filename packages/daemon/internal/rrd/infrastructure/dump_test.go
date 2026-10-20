package infrastructure_test

import (
	"context"
	"errors"
	"testing"

	rrdDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/rrd/domain"
	rrdInfra "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/rrd/infrastructure"
)

var errNoSuchSource = errors.New("no such source")

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
