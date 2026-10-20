// Package messages is every string the application puts in front of a person, kept in one
// place so the desktop window, the dialogs and the names it invents all read as one product.
package messages

const (
	ApplicationName = "RRD Analyzer"

	PickSourcesTitle    = "Select RRD sources"
	SaveExportTitle     = "Save export"
	SourceFilterPattern = "*.rrd;*.xml"
	SourceFilterDisplay = "RRD sources (" + SourceFilterPattern + ")"

	UntitledAnalysis = "Untitled analysis"
	UnnamedSource    = "source"
)
