package usecase

import (
	"slices"
	"strings"

	seriesDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/series/domain"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/shared/metricname"
)

const (
	unitNanoseconds  = "ns"
	unitMilliseconds = "ms"
	unitSeconds      = "s"
	perSecondSuffix  = "/s"
)

// unitWord ties the words a metric name uses for a quantity to the unit it is measured in. The words
// are matched whole, so "ms" never matches inside "items".
type unitWord struct {
	words []string
	unit  string
}

// explicitUnitWords name the unit outright, so they win over anything the name says about what is
// measured: memory_used_percent is a percentage, not bytes.
var explicitUnitWords = []unitWord{
	{words: []string{"percent", "pct", "utilization", "utilisation"}, unit: seriesDomain.UnitPercent},
	{words: []string{"bytes", "octets"}, unit: seriesDomain.UnitBytes},
	{words: []string{"ns", "nanoseconds"}, unit: unitNanoseconds},
	{words: []string{"ms", "milliseconds"}, unit: unitMilliseconds},
	{words: []string{"seconds", "secs", "uptime"}, unit: unitSeconds},
}

// byteQuantityWords name what collectors, Go runtimes and munin alike count in bytes: memory, the
// heap, a stack, swap and a file system's space.
var byteQuantityWords = []string{"memory", "mem", "heap", "stack", "swap", "df", "ram"}

// countWords make a metric a count of things, whatever else its name says: heap_objects is how many
// objects the heap holds, not how many bytes.
var countWords = []string{"objects", "count"}

// diskSpaceWords are the words that make a disk metric a measure of space rather than of operations
// or time: disk_used is bytes, disk_ops is not.
var diskSpaceWords = []string{"used", "free", "available", "total", "reserved"}

const diskWord = "disk"

// inferredUnit reads the unit a series is measured in from the words of its name, and from its data
// source type: rrdtool stores a counter as a rate per second, so bytes counted by a COUNTER are bytes
// per second. A name that says nothing about its unit keeps none, or "/s" for a rate, rather than a
// guess a chart would then scale and cap by.
func inferredUnit(name string, dataSourceName string, dataSourceType string) string {
	words := slices.Concat(wordsOf(name), wordsOf(dataSourceName))
	unit := unitFromWords(words)

	if !isRateSourceType(dataSourceType) {
		return unit
	}

	if unit == seriesDomain.UnitPercent {
		return unit
	}

	return unit + perSecondSuffix
}

func unitFromWords(words []string) string {
	for _, candidate := range explicitUnitWords {
		if containsAny(words, candidate.words) {
			return candidate.unit
		}
	}

	if containsAny(words, countWords) {
		return ""
	}

	if containsAny(words, byteQuantityWords) || (slices.Contains(words, diskWord) && containsAny(words, diskSpaceWords)) {
		return seriesDomain.UnitBytes
	}

	return ""
}

func wordsOf(name string) []string {
	return strings.Split(strings.ToLower(metricname.Sanitize(name)), metricname.Separator)
}

func containsAny(words []string, wanted []string) bool {
	return slices.ContainsFunc(words, func(word string) bool { return slices.Contains(wanted, word) })
}
