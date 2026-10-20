package infrastructure

import (
	"context"
	"io/fs"
	"os"
	"path"
	"sync"
	"time"

	"github.com/BurntSushi/toml"

	analysisDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/analysis/domain"
)

// UnitsFileName is where a person lists the units of series whose names do not say them, beside the
// insights rules and classifier:
//
//	[[unit]]
//	series = "atlas_application_elasticsearch_*_rate"
//	unit = "ops/s"
const UnitsFileName = "units.toml"

type unitsFile struct {
	Units []unitEntry `toml:"unit"`
}

type unitEntry struct {
	Series string  `toml:"series"`
	Unit   *string `toml:"unit"`
}

type unitsFileStamp struct {
	exists   bool
	size     int64
	modified time.Time
}

// UnitRulesLoader reads units.toml again only when its size or modification time moved, so a chart
// read costs one stat call while an edit still shows on the next read.
type UnitRulesLoader struct {
	configurationDirectory string

	mutex       sync.Mutex
	loaded      bool
	loadedStamp unitsFileStamp
	rules       []analysisDomain.UnitRule
}

var _ analysisDomain.UnitRules = (*UnitRulesLoader)(nil)

func NewUnitRulesLoader(configurationDirectory string) *UnitRulesLoader {
	return &UnitRulesLoader{configurationDirectory: configurationDirectory}
}

// Load returns the rules the file holds, in the order it lists them. A file that is missing, cannot
// be read or is not TOML holds no rules, and an entry with no series pattern, a malformed one or no
// unit is left out: a mistake in the file must never stop an analysis from opening.
func (loader *UnitRulesLoader) Load(callerContext context.Context) []analysisDomain.UnitRule {
	if loader.configurationDirectory == "" || callerContext.Err() != nil {
		return nil
	}

	current := loader.stamp()

	loader.mutex.Lock()
	defer loader.mutex.Unlock()

	if !loader.loaded || current != loader.loadedStamp {
		loader.rules = loader.read(current)
		loader.loadedStamp = current
		loader.loaded = true
	}

	return loader.rules
}

func (loader *UnitRulesLoader) read(stamp unitsFileStamp) []analysisDomain.UnitRule {
	if !stamp.exists {
		return nil
	}

	content, err := fs.ReadFile(os.DirFS(loader.configurationDirectory), UnitsFileName)
	if err != nil {
		return nil
	}

	var parsed unitsFile
	if _, err := toml.Decode(string(content), &parsed); err != nil {
		return nil
	}

	rules := make([]analysisDomain.UnitRule, 0, len(parsed.Units))
	for _, entry := range parsed.Units {
		if entry.Series == "" || entry.Unit == nil {
			continue
		}

		if _, err := path.Match(entry.Series, ""); err != nil {
			continue
		}

		rules = append(rules, analysisDomain.UnitRule{Pattern: entry.Series, Unit: *entry.Unit})
	}

	return rules
}

func (loader *UnitRulesLoader) stamp() unitsFileStamp {
	info, err := fs.Stat(os.DirFS(loader.configurationDirectory), UnitsFileName)
	if err != nil {
		return unitsFileStamp{}
	}

	return unitsFileStamp{exists: true, size: info.Size(), modified: info.ModTime()}
}
