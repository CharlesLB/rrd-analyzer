package infrastructure

import (
	rrdUsecase "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/rrd/usecase"
)

// SourceFormat tells an RRD source from any other file by its bytes. It is what another domain
// needs to know before it hands a file's bytes on.
type SourceFormat struct{}

func NewSourceFormat() *SourceFormat {
	return &SourceFormat{}
}

func (format *SourceFormat) Recognises(content []byte) bool {
	return rrdUsecase.IsSource(content)
}
