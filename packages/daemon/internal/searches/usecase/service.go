// Package usecase holds the rules of the search history: what a term is worth remembering as, and
// how much of it a field keeps.
package usecase

import (
	"context"
	"fmt"
	"strings"
	"unicode/utf8"

	searchesDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/searches/domain"
)

type Service struct {
	store searchesDomain.Store
}

func NewService(store searchesDomain.Store) *Service {
	if store == nil {
		panic("searches service: the store is required")
	}

	return &Service{store: store}
}

func (service *Service) History(callerContext context.Context, field string) ([]string, error) {
	if err := validField(field); err != nil {
		return nil, err
	}

	terms, err := service.store.Terms(callerContext, field)
	if err != nil {
		return nil, fmt.Errorf("read the search history of %q: %w", field, err)
	}

	return terms, nil
}

// Remember records a term typed in a field and answers with the field's history after it, so the
// field can show the term at the head of its list without asking again. The term is kept without
// the spaces around it, which a filter ignores anyway.
func (service *Service) Remember(callerContext context.Context, field string, term string) ([]string, error) {
	trimmed, err := rememberedTerm(term)
	if err != nil {
		return nil, err
	}

	if err := validField(field); err != nil {
		return nil, err
	}

	if err := service.store.Remember(callerContext, field, trimmed, searchesDomain.RememberedTerms); err != nil {
		return nil, fmt.Errorf("remember a search in %q: %w", field, err)
	}

	return service.History(callerContext, field)
}

// Forget removes a term from a field's history and answers with what the field still holds.
func (service *Service) Forget(callerContext context.Context, field string, term string) ([]string, error) {
	if err := validField(field); err != nil {
		return nil, err
	}

	if err := service.store.Forget(callerContext, field, strings.TrimSpace(term)); err != nil {
		return nil, fmt.Errorf("forget a search in %q: %w", field, err)
	}

	return service.History(callerContext, field)
}

func (service *Service) DeleteAll(callerContext context.Context) error {
	if err := service.store.DeleteAll(callerContext); err != nil {
		return fmt.Errorf("delete every search history: %w", err)
	}

	return nil
}

func validField(field string) error {
	if strings.TrimSpace(field) == "" || utf8.RuneCountInString(field) > searchesDomain.MaximumFieldRunes {
		return searchesDomain.ErrFieldInvalid
	}

	return nil
}

func rememberedTerm(term string) (string, error) {
	trimmed := strings.TrimSpace(term)

	if trimmed == "" {
		return "", searchesDomain.ErrTermEmpty
	}

	if utf8.RuneCountInString(trimmed) > searchesDomain.MaximumTermRunes {
		return "", searchesDomain.ErrTermTooLong
	}

	return trimmed, nil
}
