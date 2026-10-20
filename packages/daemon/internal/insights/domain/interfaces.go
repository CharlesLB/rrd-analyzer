package domain

import "context"

// SeriesSource is how the engine reaches samples. It never opens a file itself: the analysis
// layer already knows which archive covers a window, and a second reader would disagree with the
// charts about what the data says.
type SeriesSource interface {
	Catalog(callerContext context.Context, analysisID string) (Catalog, error)
	Read(callerContext context.Context, request ReadRequest) (Samples, error)
}

// ConfigurationSource hands over the active rules and classifier, already parsed and validated.
// Returning hashes with them is what lets a cached report notice that an operator edited a rule.
type ConfigurationSource interface {
	Load(callerContext context.Context) (Configuration, error)
}
