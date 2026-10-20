//go:build !js

package infrastructure_test

import (
	"context"
	"path/filepath"
	"slices"
	"testing"

	searchesInfra "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/searches/infrastructure"
)

const (
	chartLibraryField = "chart-library"
	libraryField      = "library"
	keepThree         = 3
)

func openStore(t *testing.T) *searchesInfra.Store {
	t.Helper()

	store, err := searchesInfra.OpenStore(context.Background(), filepath.Join(t.TempDir(), "analyses.db"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}

	t.Cleanup(func() { _ = store.Close() })

	return store
}

func remember(t *testing.T, store *searchesInfra.Store, field string, terms ...string) {
	t.Helper()

	for _, term := range terms {
		if err := store.Remember(context.Background(), field, term, keepThree); err != nil {
			t.Fatalf("remember %q: %v", term, err)
		}
	}
}

func termsOf(t *testing.T, store *searchesInfra.Store, field string) []string {
	t.Helper()

	terms, err := store.Terms(context.Background(), field)
	if err != nil {
		t.Fatalf("terms: %v", err)
	}

	return terms
}

func TestStoreListsTheTermRememberedLastFirst(t *testing.T) {
	store := openStore(t)

	remember(t, store, chartLibraryField, "cpu", "memory", "disk")

	if got, want := termsOf(t, store, chartLibraryField), []string{"disk", "memory", "cpu"}; !slices.Equal(got, want) {
		t.Errorf("terms = %q, want %q", got, want)
	}
}

func TestStoreMovesATermTypedAgainInAnyCaseToTheHead(t *testing.T) {
	store := openStore(t)

	remember(t, store, chartLibraryField, "cpu", "memory", "CPU")

	if got, want := termsOf(t, store, chartLibraryField), []string{"CPU", "memory"}; !slices.Equal(got, want) {
		t.Errorf("terms = %q, want %q", got, want)
	}
}

func TestStoreKeepsOnlyTheMostRecentTermsOfAField(t *testing.T) {
	store := openStore(t)

	remember(t, store, chartLibraryField, "a", "b", "c", "d")

	if got, want := termsOf(t, store, chartLibraryField), []string{"d", "c", "b"}; !slices.Equal(got, want) {
		t.Errorf("terms = %q, want %q", got, want)
	}
}

func TestStoreKeepsEachFieldsHistoryApart(t *testing.T) {
	store := openStore(t)

	remember(t, store, chartLibraryField, "cpu", "memory", "disk")
	remember(t, store, libraryField, "prod")

	if got, want := termsOf(t, store, libraryField), []string{"prod"}; !slices.Equal(got, want) {
		t.Errorf("library terms = %q, want %q", got, want)
	}

	if got := termsOf(t, store, chartLibraryField); len(got) != keepThree {
		t.Errorf("chart library kept %d terms after another field was written, want %d", len(got), keepThree)
	}
}

func TestStoreForgetsATermWhateverItsCase(t *testing.T) {
	store := openStore(t)

	remember(t, store, chartLibraryField, "cpu", "memory")

	if err := store.Forget(context.Background(), chartLibraryField, "MEMORY"); err != nil {
		t.Fatalf("forget: %v", err)
	}

	if got, want := termsOf(t, store, chartLibraryField), []string{"cpu"}; !slices.Equal(got, want) {
		t.Errorf("terms = %q, want %q", got, want)
	}
}

func TestStoreDeleteAllEmptiesEveryField(t *testing.T) {
	store := openStore(t)

	remember(t, store, chartLibraryField, "cpu")
	remember(t, store, libraryField, "prod")

	if err := store.DeleteAll(context.Background()); err != nil {
		t.Fatalf("delete all: %v", err)
	}

	if got := append(termsOf(t, store, chartLibraryField), termsOf(t, store, libraryField)...); len(got) != 0 {
		t.Errorf("terms after delete all = %q, want none", got)
	}
}
