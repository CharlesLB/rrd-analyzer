package infrastructure_test

import (
	"testing"

	rrdInfra "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/rrd/infrastructure"
)

func TestSourceFormatRecognises(t *testing.T) {
	tests := []struct {
		name string
		give []byte
		want bool
	}{
		{name: "a binary database", give: inPlaceDatabase(), want: true},
		{name: "an XML dump", give: []byte(oneSourceDump), want: true},
		{name: "any other file", give: []byte("-----BEGIN OPENSSH PRIVATE KEY-----"), want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := rrdInfra.NewSourceFormat().Recognises(tt.give); got != tt.want {
				t.Errorf("Recognises = %v, want %v", got, tt.want)
			}
		})
	}
}
