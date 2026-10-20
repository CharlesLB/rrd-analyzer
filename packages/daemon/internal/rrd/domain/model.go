package domain

// Database is a round robin database as every reader hands it over: the binary file decoded in
// place and an rrdtool XML dump produce this same shape, so the projection onto series is
// written once and both routes are read the same way.
type Database struct {
	StepSeconds       int64
	LastUpdateSeconds int64
	DataSources       []DataSource
	Archives          []Archive
}

// DataSource is one value the database records. Maximum is the ceiling rrdtool was told to clip
// the input to, NaN when the data source was created without one ("U").
type DataSource struct {
	Name    string
	Type    string
	Maximum float64
}

// Archive is one round robin archive with its rows already unrolled, oldest first. Values are
// row-major with one entry per data source, and a reading that was never written is NaN, which
// is how the binary format and an XML dump both spell an unknown.
type Archive struct {
	Function            string
	PrimaryPointsPerRow int64
	RowCount            int
	Values              []float64
}

func (archive Archive) ValueAt(rowIndex, dataSourceIndex, dataSourceCount int) float64 {
	return archive.Values[rowIndex*dataSourceCount+dataSourceIndex]
}
