package domain

import "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/shared/failure"

const (
	ErrNothingToExport  failure.Error = "export: nothing visible to export"
	ErrSourceUnlocated  failure.Error = "export: a source has no file path, so there is nothing on disk to copy"
	ErrSourceUnreadable failure.Error = "export: a source could not be read from disk"
	ErrNotASource       failure.Error = "export: a file is not an RRD database or dump, so it is not copied"
)
