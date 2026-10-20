// Package domain holds the shapes and failure modes of reading an RRD dump.
package domain

import "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/shared/failure"

const (
	ErrUnreadableSource failure.Error = "rrd: source cannot be read"
	ErrNotAnRRDDump     failure.Error = "rrd: file is neither a database nor an xml dump"
	ErrEmptyArchive     failure.Error = "rrd: dump contains no round robin archive with rows"
	ErrDumpToolMissing  failure.Error = "rrd: rrdtool is required to read binary .rrd files"
	ErrUnreadableLayout failure.Error = "rrd: binary database is not a layout this build can read in place"
)
