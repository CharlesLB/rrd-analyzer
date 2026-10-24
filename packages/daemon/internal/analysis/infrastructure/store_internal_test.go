//go:build !js

package infrastructure

import (
	"errors"
	"testing"
)

var errRowsUncounted = errors.New("rows uncounted")

// uncountedResult is a result whose driver cannot say how many rows the statement changed. SQLite
// always can, which is why only a stand-in reaches the branch that handles it.
type uncountedResult struct{}

func (uncountedResult) LastInsertId() (int64, error) {
	return 0, errRowsUncounted
}

func (uncountedResult) RowsAffected() (int64, error) {
	return 0, errRowsUncounted
}

func TestUpdatedOne_AResultThatCannotCountItsRows_ReportsWhy(t *testing.T) {
	err := updatedOne(uncountedResult{}, "a1")

	if !errors.Is(err, errRowsUncounted) {
		t.Fatalf("err = %v, want %v", err, errRowsUncounted)
	}
}
