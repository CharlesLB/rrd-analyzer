package strict_test

import (
	"slices"
	"testing"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/usecase/strict"
)

type entry struct {
	Name  string   `toml:"name"`
	Level *float64 `toml:"level"`
}

func TestDecode_TableWithUnknownKeys_DecodesKnownFieldsAndReportsTheRest(t *testing.T) {
	var decoded entry

	unknown, err := strict.Decode(map[string]any{"name": "cpu", "level": int64(65), "zeta": 1, "alpha": map[string]any{"inner": true}}, &decoded)
	if err != nil {
		t.Fatalf("Decode: %v", err)
	}

	if decoded.Name != "cpu" || decoded.Level == nil || *decoded.Level != 65 {
		t.Errorf("decoded = %+v, want cpu at an integer level read as a float", decoded)
	}

	if want := []string{"alpha", "alpha.inner", "zeta"}; !slices.Equal(unknown, want) {
		t.Errorf("unknown keys = %v, want %v", unknown, want)
	}
}

func TestDecode_WrongValueType_IsAnError(t *testing.T) {
	var decoded entry

	if _, err := strict.Decode(map[string]any{"name": 3}, &decoded); err == nil {
		t.Error("Decode accepted a number for a string field")
	}

	if _, err := strict.Decode(map[string]any{"name": make(chan int)}, &decoded); err == nil {
		t.Error("Decode accepted a value TOML cannot encode")
	}
}

func TestTables_Document_ReturnsTheArrayAndOtherTopLevelKeys(t *testing.T) {
	tables, unknown, err := strict.Tables([]byte("version = 2\n[[match]]\nname = \"a\"\n[[match]]\nname = \"b\"\n"), "match")
	if err != nil {
		t.Fatalf("Tables: %v", err)
	}

	if len(tables) != 2 || tables[1]["name"] != "b" || !slices.Equal(unknown, []string{"version"}) {
		t.Errorf("Tables = %v, %v; want two tables and version unknown", tables, unknown)
	}

	if tables, _, err := strict.Tables([]byte(""), "match"); err != nil || tables != nil {
		t.Errorf("empty document = %v, %v; want no tables and no error", tables, err)
	}

	for _, malformed := range []string{"[[match]\n", "match = 3\n"} {
		if _, _, err := strict.Tables([]byte(malformed), "match"); err == nil {
			t.Errorf("Tables(%q) accepted a malformed document", malformed)
		}
	}
}
