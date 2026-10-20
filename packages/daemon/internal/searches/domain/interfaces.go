package domain

import "context"

// Store is the search history as it is persisted, one list per field.
//
// Terms answers with the field's terms, the one remembered most recently first. Remember puts a
// term at the head of its field, in place of the same term typed with any other letter case, and
// keeps only the first keep terms of that field. Forget removes the term from its field whatever
// its letter case, and is not an error for a term the field does not hold.
type Store interface {
	Terms(callerContext context.Context, field string) ([]string, error)
	Remember(callerContext context.Context, field string, term string, keep int) error
	Forget(callerContext context.Context, field string, term string) error
	DeleteAll(callerContext context.Context) error
}
