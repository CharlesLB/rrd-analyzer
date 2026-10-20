// Package domain holds the shape of an export and where it may be written.
package domain

// CSVRequest is an export of some series of one analysis over the window they were shown in.
type CSVRequest struct {
	AnalysisID        string
	SeriesIDs         []string
	FromMilliseconds  int64
	UntilMilliseconds int64
}

// SavedExport is an export that reached disk: where it was written and what it holds. An empty
// Path is a save dialog the person cancelled, which wrote nothing.
type SavedExport struct {
	Path        string `json:"path"`
	SampleCount int    `json:"sampleCount"`
	SeriesCount int    `json:"seriesCount"`
}

// CSVDocument is an encoded CSV export and what it holds: the desktop saves it where the native
// dialog points, and the development server hands it to the browser to download.
type CSVDocument struct {
	FileName    string `json:"fileName"`
	Content     []byte `json:"-"`
	SampleCount int    `json:"sampleCount"`
	SeriesCount int    `json:"seriesCount"`
}

// SourceFile is one file an analysis was created from, as a copy of the sources reads it.
type SourceFile struct {
	Name string
	Path string
}

// SourceSet is everything an analysis was created from, and the name it goes by.
type SourceSet struct {
	AnalysisName string
	Files        []SourceFile
}

// SourcesDocument is the copy of an analysis' sources: the one file itself, or an archive of all of
// them when there are several.
type SourcesDocument struct {
	FileName  string `json:"fileName"`
	Content   []byte `json:"-"`
	FileCount int    `json:"fileCount"`
}

// SavedSources is a copy of the sources that reached disk. An empty Path is a save dialog the
// person cancelled, which wrote nothing.
type SavedSources struct {
	Path      string `json:"path"`
	FileCount int    `json:"fileCount"`
}

// Grid is the window an export reads and the number of rows it splits that window into.
type Grid struct {
	FromMilliseconds  int64
	UntilMilliseconds int64
	Columns           int
}

type Table struct {
	Header      []string   `json:"header"`
	Rows        [][]string `json:"rows"`
	SeriesNames []string   `json:"seriesNames"`
}

func (table Table) SeriesCount() int {
	if len(table.Header) == 0 {
		return 0
	}

	return len(table.Header) - 1
}
