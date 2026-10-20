package metricname_test

import (
	"testing"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/shared/messages"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/shared/metricname"
)

func TestSanitize_CollapsesEveryRunOfPunctuationIntoOneSeparator(t *testing.T) {
	tests := []struct {
		name string
		give string
		want string
	}{
		{name: "already a name", give: "atlas_prod", want: "atlas_prod"},
		{name: "dots and dashes", give: "atlas.prod-01", want: "atlas_prod_01"},
		{name: "run of punctuation", give: "atlas   ///prod", want: "atlas_prod"},
		{name: "edges trimmed", give: "-atlas-", want: "atlas"},
		{name: "nothing usable", give: "///", want: ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := metricname.Sanitize(tt.give); got != tt.want {
				t.Errorf("Sanitize(%q) = %q, want %q", tt.give, got, tt.want)
			}
		})
	}
}

func TestRootOf_FileNameWithoutExtension_BecomesASanitizedRoot(t *testing.T) {
	tests := []struct {
		name string
		give string
		want string
	}{
		{name: "plain file", give: "cpu.rrd", want: "cpu"},
		{name: "punctuation in the name", give: "atlas-prod.rrd", want: "atlas_prod"},
		{name: "only the last extension goes", give: "archive.tar.xml", want: "archive_tar"},
		{name: "no extension", give: "memory", want: "memory"},
		{name: "extension only", give: ".rrd", want: messages.UnnamedSource},
		{name: "nothing usable", give: "///.rrd", want: messages.UnnamedSource},
		{name: "empty", give: "", want: messages.UnnamedSource},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := metricname.RootOf(tt.give); got != tt.want {
				t.Errorf("RootOf(%q) = %q, want %q", tt.give, got, tt.want)
			}
		})
	}
}

func TestLabelOf_DropsTheRootUnlessThatIsAllThereIs(t *testing.T) {
	tests := []struct {
		name string
		give string
		want string
	}{
		{name: "root and metric", give: "atlas_prod_cpu_user", want: "prod_cpu_user"},
		{name: "root only", give: "atlas", want: "atlas"},
		{name: "empty", give: "", want: ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := metricname.LabelOf(tt.give); got != tt.want {
				t.Errorf("LabelOf(%q) = %q, want %q", tt.give, got, tt.want)
			}
		})
	}
}
