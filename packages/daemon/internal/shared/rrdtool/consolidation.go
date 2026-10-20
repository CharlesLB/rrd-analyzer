// Package rrdtool holds the words rrdtool itself uses, which this application reads out of files it
// did not write and must spell back exactly.
package rrdtool

// The consolidation functions an archive can be kept under. They are written here once because two
// domains name them on their own account — the series domain as the archives it reads, the insights
// domain as the function a rule asks for — and a rule's answer is looked up among the archives by
// this very string. Spelled apart, one of them could drift and a rule would silently read averages.
const (
	ConsolidationAverage = "AVERAGE"
	ConsolidationMinimum = "MIN"
	ConsolidationMaximum = "MAX"
	ConsolidationLast    = "LAST"
)
