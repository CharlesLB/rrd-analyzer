package digest_test

import (
	"math"
	"testing"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/shared/digest"
)

func TestOfJSON_EncodableValue_IsTheHexSHA256OfItsJSON(t *testing.T) {
	tests := []struct {
		name string
		give any
		want string
	}{
		{name: "array of strings", give: []string{"a"}, want: "0eb5b8d6f81bc677da8a08567cc4fa9a06a57e9ec8da85ed73a7f62727996002"},
		{name: "object", give: map[string]int{"b": 1}, want: "eb8ed3ccb5023093b56f490a46501e88d09736687e609fdbc1c71b3df8b9ccd3"},
		{name: "nil", give: nil, want: "74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := digest.OfJSON(tt.give)
			if err != nil {
				t.Fatalf("OfJSON(%v): %v", tt.give, err)
			}

			if got != tt.want {
				t.Errorf("OfJSON(%v) = %s, want %s", tt.give, got, tt.want)
			}
		})
	}
}

func TestOfJSON_UnencodableValue_ReturnsTheEncodingError(t *testing.T) {
	got, err := digest.OfJSON(math.NaN())

	if err == nil || got != "" {
		t.Fatalf("OfJSON(NaN) = %q, %v; want no digest and an error", got, err)
	}
}
