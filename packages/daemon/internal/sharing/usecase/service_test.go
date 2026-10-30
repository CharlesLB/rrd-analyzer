package usecase_test

import (
	"context"
	"errors"
	"testing"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/sharing/domain"
	sharingInfra "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/sharing/infrastructure"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/sharing/usecase"
)

func completeDependencies() usecase.Dependencies {
	return usecase.Dependencies{
		Registry: sharingInfra.NewMemoryRegistry(),
		Library:  newFakeLibrary(),
		Reader:   diskReader{},
		Format:   prefixFormat{},
		Entropy:  &countingEntropy{},
		Clock:    fixedClock{},
	}
}

func TestNewService_AMissingWire_Panics(t *testing.T) {
	tests := []struct {
		name             string
		giveDependencies func(dependencies *usecase.Dependencies)
	}{
		{name: "no registry", giveDependencies: func(dependencies *usecase.Dependencies) { dependencies.Registry = nil }},
		{name: "no library", giveDependencies: func(dependencies *usecase.Dependencies) { dependencies.Library = nil }},
		{name: "no reader", giveDependencies: func(dependencies *usecase.Dependencies) { dependencies.Reader = nil }},
		{name: "no format", giveDependencies: func(dependencies *usecase.Dependencies) { dependencies.Format = nil }},
		{name: "no entropy", giveDependencies: func(dependencies *usecase.Dependencies) { dependencies.Entropy = nil }},
		{name: "no clock", giveDependencies: func(dependencies *usecase.Dependencies) { dependencies.Clock = nil }},
		{name: "an address without a client", giveDependencies: func(dependencies *usecase.Dependencies) { dependencies.ServiceURL = "https://share.example" }},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			dependencies := completeDependencies()
			tt.giveDependencies(&dependencies)

			defer func() {
				if recover() == nil {
					t.Error("construction went through, want a panic naming the missing wire")
				}
			}()

			usecase.NewService(dependencies)
		})
	}
}

func TestService_ABuildGivenNoShareService_SharesNothing(t *testing.T) {
	service := usecase.NewService(completeDependencies())
	callerContext := context.Background()

	calls := []struct {
		name     string
		giveCall func() error
	}{
		{name: "start", giveCall: func() error {
			_, err := service.Start(callerContext, ownedAnalysis, domain.Publication{})

			return err
		}},
		{name: "publish", giveCall: func() error {
			_, err := service.Publish(callerContext, ownedAnalysis, domain.Publication{})

			return err
		}},
		{name: "status", giveCall: func() error {
			_, err := service.Status(callerContext, ownedAnalysis)

			return err
		}},
		{name: "list", giveCall: func() error {
			_, err := service.List(callerContext)

			return err
		}},
		{name: "end", giveCall: func() error { return service.End(callerContext, ownedAnalysis) }},
		{name: "join", giveCall: func() error {
			_, err := service.Join(callerContext, "session", "key")

			return err
		}},
		{name: "refresh", giveCall: func() error {
			_, err := service.Refresh(callerContext, "session")

			return err
		}},
		{name: "forget", giveCall: func() error { return service.Forget(callerContext, "session") }},
	}

	if service.SharesSessions() {
		t.Error("SharesSessions() = true, want false with no share service")
	}

	for _, tt := range calls {
		t.Run(tt.name, func(t *testing.T) {
			if err := tt.giveCall(); !errors.Is(err, domain.ErrNotConfigured) {
				t.Errorf("err = %v, want %v", err, domain.ErrNotConfigured)
			}
		})
	}
}

func TestRelease_ABuildGivenNoShareService_StillForgetsASessionAnEarlierBuildStarted(t *testing.T) {
	dependencies := completeDependencies()
	if err := dependencies.Registry.Save(context.Background(), domain.OwnedSession{AnalysisID: ownedAnalysis, SessionID: "session"}); err != nil {
		t.Fatalf("save: %v", err)
	}

	service := usecase.NewService(dependencies)

	if err := service.Release(context.Background(), ownedAnalysis); err != nil {
		t.Fatalf("release: %v", err)
	}

	if _, err := dependencies.Registry.Get(context.Background(), ownedAnalysis); !errors.Is(err, domain.ErrNotLive) {
		t.Errorf("get after release = %v, want %v", err, domain.ErrNotLive)
	}
}

func TestService_WhereNoFileCanBeKeptInMemory_FollowsNoSession(t *testing.T) {
	shared := newWorld(t)
	callerContext := context.Background()

	calls := []struct {
		name     string
		giveCall func() error
	}{
		{name: "join", giveCall: func() error {
			_, err := shared.owner.service.Join(callerContext, "session", "key")

			return err
		}},
		{name: "refresh", giveCall: func() error {
			_, err := shared.owner.service.Refresh(callerContext, "session")

			return err
		}},
		{name: "forget", giveCall: func() error { return shared.owner.service.Forget(callerContext, "session") }},
	}

	if !shared.owner.service.SharesSessions() {
		t.Error("SharesSessions() = false, want true with a share service")
	}

	for _, tt := range calls {
		t.Run(tt.name, func(t *testing.T) {
			if err := tt.giveCall(); !errors.Is(err, domain.ErrViewingUnavailable) {
				t.Errorf("err = %v, want %v", err, domain.ErrViewingUnavailable)
			}
		})
	}
}
