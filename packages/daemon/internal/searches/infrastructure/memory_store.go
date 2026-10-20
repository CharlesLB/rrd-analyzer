package infrastructure

import (
	"context"
	"fmt"
	"slices"
	"strings"
	"sync"
)

// MemoryStore keeps the search history in memory, for the browser edition, which keeps nothing
// past the tab it runs in. It answers the way Store does: a field's terms come most recent first, a
// term remembered again moves to the head in place of any spelling of it, and each field keeps only
// the terms it was told to.
type MemoryStore struct {
	mutex   sync.Mutex
	byField map[string][]string
}

func NewMemoryStore() *MemoryStore {
	return &MemoryStore{byField: make(map[string][]string)}
}

func (store *MemoryStore) Terms(callerContext context.Context, field string) ([]string, error) {
	if err := callerContext.Err(); err != nil {
		return nil, fmt.Errorf("list the searches of %q: %w", field, err)
	}

	store.mutex.Lock()
	defer store.mutex.Unlock()

	return slices.Clone(store.byField[field]), nil
}

func (store *MemoryStore) Remember(callerContext context.Context, field string, term string, keep int) error {
	if err := callerContext.Err(); err != nil {
		return fmt.Errorf("remember a search of %q: %w", field, err)
	}

	store.mutex.Lock()
	defer store.mutex.Unlock()

	remembered := append([]string{term}, withoutTerm(store.byField[field], term)...)
	store.byField[field] = remembered[:min(len(remembered), max(keep, 0))]

	return nil
}

func (store *MemoryStore) Forget(callerContext context.Context, field string, term string) error {
	if err := callerContext.Err(); err != nil {
		return fmt.Errorf("forget a search of %q: %w", field, err)
	}

	store.mutex.Lock()
	defer store.mutex.Unlock()

	store.byField[field] = withoutTerm(store.byField[field], term)

	return nil
}

func (store *MemoryStore) DeleteAll(callerContext context.Context) error {
	if err := callerContext.Err(); err != nil {
		return fmt.Errorf("forget every search: %w", err)
	}

	store.mutex.Lock()
	defer store.mutex.Unlock()

	store.byField = make(map[string][]string)

	return nil
}

// withoutTerm is terms less every spelling of term, whatever its letter case.
func withoutTerm(terms []string, term string) []string {
	return slices.DeleteFunc(slices.Clone(terms), func(kept string) bool {
		return strings.EqualFold(kept, term)
	})
}
