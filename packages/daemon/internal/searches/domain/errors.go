package domain

import "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/shared/failure"

const (
	ErrFieldInvalid failure.Error = "searches: a search history is kept under a field name that is not blank and not too long"
	ErrTermEmpty    failure.Error = "searches: a term to remember is not blank"
	ErrTermTooLong  failure.Error = "searches: a term to remember is short enough to be typed again"
)
