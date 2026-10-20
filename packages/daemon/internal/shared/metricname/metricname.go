// Package metricname turns the names a source carries into the names the charts show.
package metricname

import (
	"path/filepath"
	"regexp"
	"strings"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/shared/messages"
)

// Separator joins the parts of a metric name, and is what the source tree splits on.
const Separator = "_"

var nonNameCharacters = regexp.MustCompile(`[^A-Za-z0-9]+`)

// Sanitize turns arbitrary text into one metric name part: every run of anything that is not a
// letter or a digit becomes a single separator, and the edges are trimmed.
func Sanitize(raw string) string {
	return strings.Trim(nonNameCharacters.ReplaceAllString(raw, Separator), Separator)
}

// RootOf is the root every series read from a file is named under. The parser and the synthetic
// loader both call it, so example series are named exactly the way real files would name them.
func RootOf(fileName string) string {
	root := Sanitize(strings.TrimSuffix(fileName, filepath.Ext(fileName)))
	if root == "" {
		return messages.UnnamedSource
	}

	return root
}

// LabelOf is a metric name without its root. The file a series came from is already on screen
// beside it, so the chip and the legend repeat only what distinguishes one series from another.
func LabelOf(name string) string {
	_, label, found := strings.Cut(name, Separator)
	if !found {
		return name
	}

	return label
}
