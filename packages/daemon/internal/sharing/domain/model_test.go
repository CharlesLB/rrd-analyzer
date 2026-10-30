package domain_test

import (
	"encoding/json"
	"testing"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/sharing/domain"
)

var (
	cpuBlob = domain.Blob{FileID: "file-1", Name: "cpu.rrd", Size: 10, ChunkCount: 1}
	logBlob = domain.Blob{FileID: "file-2", Name: "service.ndjson", Size: 4, ChunkCount: 1}
)

// The blob a file and a log embed is written at their own level, in the order the registry's columns
// and every sealed state already hold, so neither a database nor a state written before reads
// differently.
func TestModel_TheJSONOfWhatIsStoredAndSealed_KeepsItsShape(t *testing.T) {
	tests := []struct {
		name     string
		giveItem any
		wantJSON string
	}{
		{
			name:     "a file online, as the registry keeps it",
			giveItem: domain.OnlineFile{Identity: "/srv/cpu.rrd", Blob: cpuBlob},
			wantJSON: `{"identity":"/srv/cpu.rrd","fileId":"file-1","name":"cpu.rrd","size":10,"chunkCount":1}`,
		},
		{
			name:     "a log online, as the registry keeps it",
			giveItem: domain.OnlineLog{Blob: logBlob, Digest: "abcd"},
			wantJSON: `{"fileId":"file-2","name":"service.ndjson","size":4,"chunkCount":1,"digest":"abcd"}`,
		},
		{
			name:     "a log joined again, its content left out",
			giveItem: domain.JoinedLog{FileID: "file-2", Name: "service.ndjson", View: json.RawMessage(`{}`)},
			wantJSON: `{"fileId":"file-2","name":"service.ndjson","view":{}}`,
		},
		{
			name: "a state, as it is sealed",
			giveItem: domain.State{
				Format:                  domain.StateFormat,
				Name:                    "Checkout",
				Files:                   []domain.Blob{cpuBlob},
				Log:                     &domain.StateLog{Blob: logBlob, View: json.RawMessage(`{"shown":true}`)},
				PublishedAtMilliseconds: 1773307800000,
			},
			wantJSON: `{"format":1,"name":"Checkout","files":[{"fileId":"file-1","name":"cpu.rrd","size":10,"chunkCount":1}],"canvas":null,` +
				`"libraryOrder":null,"seriesColors":null,"log":{"fileId":"file-2","name":"service.ndjson","size":4,"chunkCount":1,"view":{"shown":true}},` +
				`"publishedAtMilliseconds":1773307800000}`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			encoded, err := json.Marshal(tt.giveItem)
			if err != nil || string(encoded) != tt.wantJSON {
				t.Errorf("json = %s, %v; want %s", encoded, err, tt.wantJSON)
			}
		})
	}
}
