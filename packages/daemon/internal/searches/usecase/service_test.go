package usecase_test

import (
	"context"
	"errors"
	"slices"
	"strings"
	"testing"

	searchesDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/searches/domain"
	searchesUsecase "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/searches/usecase"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/shared/failure"
)

const chartLibraryField = "chart-library"

type rememberedTerm struct {
	field string
	term  string
	keep  int
}

type memoryStore struct {
	remembered []rememberedTerm
	forgotten  []string
	terms      []string
}

func (store *memoryStore) Terms(context.Context, string) ([]string, error) {
	return store.terms, nil
}

func (store *memoryStore) Remember(_ context.Context, field string, term string, keep int) error {
	store.remembered = append(store.remembered, rememberedTerm{field: field, term: term, keep: keep})
	store.terms = append([]string{term}, store.terms...)

	return nil
}

func (store *memoryStore) Forget(_ context.Context, _ string, term string) error {
	store.forgotten = append(store.forgotten, term)

	return nil
}

func (store *memoryStore) DeleteAll(context.Context) error {
	return nil
}

const errStoreUnavailable failure.Error = "the search history cannot be reached"

// failingStore is a search history that refuses every call, the way a database that went away
// would.
type failingStore struct{}

func (failingStore) Terms(context.Context, string) ([]string, error) {
	return nil, errStoreUnavailable
}

func (failingStore) Remember(context.Context, string, string, int) error {
	return errStoreUnavailable
}

func (failingStore) Forget(context.Context, string, string) error {
	return errStoreUnavailable
}

func (failingStore) DeleteAll(context.Context) error {
	return errStoreUnavailable
}

// historyFailingStore remembers and forgets, then cannot read back what the field holds.
type historyFailingStore struct {
	memoryStore
}

func (*historyFailingStore) Terms(context.Context, string) ([]string, error) {
	return nil, errStoreUnavailable
}

func TestNewServiceWithoutAStorePanicsNamingTheWire(t *testing.T) {
	defer func() {
		recovered := recover()
		if message, isText := recovered.(string); !isText || !strings.Contains(message, "store") {
			t.Errorf("panic = %v, want a message naming the store", recovered)
		}
	}()

	searchesUsecase.NewService(nil)
}

func TestServiceReportsAStoreThatFails(t *testing.T) {
	tests := []struct {
		name      string
		giveStore searchesDomain.Store
		giveCall  func(service *searchesUsecase.Service) error
	}{
		{name: "history", giveStore: failingStore{}, giveCall: func(service *searchesUsecase.Service) error {
			_, err := service.History(context.Background(), chartLibraryField)

			return err
		}},
		{name: "remember", giveStore: failingStore{}, giveCall: func(service *searchesUsecase.Service) error {
			_, err := service.Remember(context.Background(), chartLibraryField, "cpu")

			return err
		}},
		{name: "forget", giveStore: failingStore{}, giveCall: func(service *searchesUsecase.Service) error {
			_, err := service.Forget(context.Background(), chartLibraryField, "cpu")

			return err
		}},
		{name: "delete all", giveStore: failingStore{}, giveCall: func(service *searchesUsecase.Service) error {
			return service.DeleteAll(context.Background())
		}},
		{name: "the history read back after remembering", giveStore: &historyFailingStore{}, giveCall: func(service *searchesUsecase.Service) error {
			_, err := service.Remember(context.Background(), chartLibraryField, "cpu")

			return err
		}},
		{name: "the history read back after forgetting", giveStore: &historyFailingStore{}, giveCall: func(service *searchesUsecase.Service) error {
			_, err := service.Forget(context.Background(), chartLibraryField, "cpu")

			return err
		}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.giveCall(searchesUsecase.NewService(tt.giveStore))

			if !errors.Is(err, errStoreUnavailable) {
				t.Errorf("err = %v, want %v", err, errStoreUnavailable)
			}
		})
	}
}

func TestDeleteAllEmptiesTheHistoryThroughTheStore(t *testing.T) {
	if err := searchesUsecase.NewService(&memoryStore{}).DeleteAll(context.Background()); err != nil {
		t.Errorf("delete all: %v", err)
	}
}

func TestRememberKeepsTheTrimmedTermAndAnswersWithTheHistory(t *testing.T) {
	store := &memoryStore{terms: []string{"memory"}}

	history, err := searchesUsecase.NewService(store).Remember(context.Background(), chartLibraryField, "  cpu ")
	if err != nil {
		t.Fatalf("remember: %v", err)
	}

	want := rememberedTerm{field: chartLibraryField, term: "cpu", keep: searchesDomain.RememberedTerms}
	if len(store.remembered) != 1 || store.remembered[0] != want {
		t.Errorf("remembered = %+v, want [%+v]", store.remembered, want)
	}

	if !slices.Equal(history, []string{"cpu", "memory"}) {
		t.Errorf("history = %q, want the term ahead of what the field held", history)
	}
}

func TestRememberRefusesWhatIsNotWorthRemembering(t *testing.T) {
	tests := []struct {
		name      string
		giveField string
		giveTerm  string
		want      error
	}{
		{name: "blank term", giveField: chartLibraryField, giveTerm: "   ", want: searchesDomain.ErrTermEmpty},
		{name: "term too long", giveField: chartLibraryField, giveTerm: strings.Repeat("x", searchesDomain.MaximumTermRunes+1), want: searchesDomain.ErrTermTooLong},
		{name: "blank field", giveField: " ", giveTerm: "cpu", want: searchesDomain.ErrFieldInvalid},
		{name: "field too long", giveField: strings.Repeat("f", searchesDomain.MaximumFieldRunes+1), giveTerm: "cpu", want: searchesDomain.ErrFieldInvalid},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			store := &memoryStore{}

			_, err := searchesUsecase.NewService(store).Remember(context.Background(), tt.giveField, tt.giveTerm)

			if !errors.Is(err, tt.want) {
				t.Errorf("err = %v, want %v", err, tt.want)
			}

			if len(store.remembered) != 0 {
				t.Errorf("remembered %+v for a refused request", store.remembered)
			}
		})
	}
}

func TestHistoryRefusesAFieldWithoutAName(t *testing.T) {
	if _, err := searchesUsecase.NewService(&memoryStore{}).History(context.Background(), ""); !errors.Is(err, searchesDomain.ErrFieldInvalid) {
		t.Errorf("err = %v, want %v", err, searchesDomain.ErrFieldInvalid)
	}
}

func TestForgetRefusesAFieldWithoutANameAndForgetsNothing(t *testing.T) {
	store := &memoryStore{}

	if _, err := searchesUsecase.NewService(store).Forget(context.Background(), " ", "cpu"); !errors.Is(err, searchesDomain.ErrFieldInvalid) {
		t.Errorf("err = %v, want %v", err, searchesDomain.ErrFieldInvalid)
	}

	if len(store.forgotten) != 0 {
		t.Errorf("forgotten %q for a refused request", store.forgotten)
	}
}

func TestForgetRemovesTheTrimmedTerm(t *testing.T) {
	store := &memoryStore{}

	if _, err := searchesUsecase.NewService(store).Forget(context.Background(), chartLibraryField, " cpu "); err != nil {
		t.Fatalf("forget: %v", err)
	}

	if !slices.Equal(store.forgotten, []string{"cpu"}) {
		t.Errorf("forgotten = %q, want [\"cpu\"]", store.forgotten)
	}
}
