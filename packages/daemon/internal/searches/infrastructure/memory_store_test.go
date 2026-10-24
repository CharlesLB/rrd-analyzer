package infrastructure_test

import (
	"context"
	"errors"
	"slices"
	"testing"

	searchesInfra "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/searches/infrastructure"
)

const memoryHistoryLimit = 3

func rememberInMemory(t *testing.T, store *searchesInfra.MemoryStore, field string, terms ...string) {
	t.Helper()

	for _, term := range terms {
		if err := store.Remember(context.Background(), field, term, memoryHistoryLimit); err != nil {
			t.Fatalf("remember %q: %v", term, err)
		}
	}
}

func termsKeptInMemory(t *testing.T, store *searchesInfra.MemoryStore, field string) []string {
	t.Helper()

	terms, err := store.Terms(context.Background(), field)
	if err != nil {
		t.Fatalf("terms: %v", err)
	}

	return terms
}

func TestMemoryStoreRemembers(t *testing.T) {
	tests := []struct {
		name string
		give []string
		want []string
	}{
		{name: "most recent first", give: []string{"cpu", "memory"}, want: []string{"memory", "cpu"}},
		{name: "a term typed again moves to the head in its new spelling", give: []string{"cpu", "memory", "CPU"}, want: []string{"CPU", "memory"}},
		{name: "only as many terms as it is told to keep", give: []string{"a", "b", "c", "d"}, want: []string{"d", "c", "b"}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			store := searchesInfra.NewMemoryStore()
			rememberInMemory(t, store, "charts", tt.give...)

			if got := termsKeptInMemory(t, store, "charts"); !slices.Equal(got, tt.want) {
				t.Fatalf("want %v, got %v", tt.want, got)
			}
		})
	}
}

func TestMemoryStoreKeepsEachFieldToItself(t *testing.T) {
	store := searchesInfra.NewMemoryStore()
	rememberInMemory(t, store, "charts", "cpu")
	rememberInMemory(t, store, "logs", "timeout")

	if got := termsKeptInMemory(t, store, "logs"); !slices.Equal(got, []string{"timeout"}) {
		t.Fatalf("want only the logs search, got %v", got)
	}
}

func TestMemoryStoreForgetsATermWhateverItsCase(t *testing.T) {
	store := searchesInfra.NewMemoryStore()
	rememberInMemory(t, store, "charts", "cpu", "memory")

	if err := store.Forget(context.Background(), "charts", "CPU"); err != nil {
		t.Fatalf("forget: %v", err)
	}

	if got := termsKeptInMemory(t, store, "charts"); !slices.Equal(got, []string{"memory"}) {
		t.Fatalf("want [memory], got %v", got)
	}
}

func TestMemoryStoreForgetsEverySearchAtOnce(t *testing.T) {
	store := searchesInfra.NewMemoryStore()
	rememberInMemory(t, store, "charts", "cpu")
	rememberInMemory(t, store, "logs", "timeout")

	if err := store.DeleteAll(context.Background()); err != nil {
		t.Fatalf("delete all: %v", err)
	}

	if got := append(termsKeptInMemory(t, store, "charts"), termsKeptInMemory(t, store, "logs")...); len(got) != 0 {
		t.Fatalf("want no searches, got %v", got)
	}
}

func TestMemoryStore_ACancelledCaller_IsRefusedAndChangesNothing(t *testing.T) {
	store := searchesInfra.NewMemoryStore()
	rememberInMemory(t, store, "charts", "cpu")

	cancelled, cancel := context.WithCancel(context.Background())
	cancel()

	tests := []struct {
		name     string
		giveCall func(callerContext context.Context) error
	}{
		{name: "terms", giveCall: func(callerContext context.Context) error {
			_, err := store.Terms(callerContext, "charts")

			return err
		}},
		{name: "remember", giveCall: func(callerContext context.Context) error {
			return store.Remember(callerContext, "charts", "memory", memoryHistoryLimit)
		}},
		{name: "forget", giveCall: func(callerContext context.Context) error {
			return store.Forget(callerContext, "charts", "cpu")
		}},
		{name: "delete all", giveCall: func(callerContext context.Context) error {
			return store.DeleteAll(callerContext)
		}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if err := tt.giveCall(cancelled); !errors.Is(err, context.Canceled) {
				t.Fatalf("err = %v, want %v", err, context.Canceled)
			}

			if got := termsKeptInMemory(t, store, "charts"); !slices.Equal(got, []string{"cpu"}) {
				t.Errorf("terms = %v, want [cpu] untouched by the refused call", got)
			}
		})
	}
}
