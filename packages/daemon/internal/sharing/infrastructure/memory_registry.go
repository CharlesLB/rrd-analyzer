package infrastructure

import (
	"context"
	"fmt"
	"slices"
	"sync"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/sharing/domain"
)

// MemoryRegistry keeps the live sessions this app owns in memory, for the browser edition, which
// keeps nothing past its tab. It answers the way Store does, sessions in the order they were first
// saved, and copies the slices that cross it, so a caller still holding a session cannot change the
// one it keeps.
type MemoryRegistry struct {
	mutex      sync.Mutex
	byAnalysis map[string]domain.OwnedSession
	order      []string
}

func NewMemoryRegistry() *MemoryRegistry {
	return &MemoryRegistry{byAnalysis: make(map[string]domain.OwnedSession)}
}

func (registry *MemoryRegistry) List(callerContext context.Context) ([]domain.OwnedSession, error) {
	if err := callerContext.Err(); err != nil {
		return nil, fmt.Errorf("list live sessions: %w", err)
	}

	registry.mutex.Lock()
	defer registry.mutex.Unlock()

	sessions := make([]domain.OwnedSession, 0, len(registry.order))
	for _, analysisID := range registry.order {
		sessions = append(sessions, copyOf(registry.byAnalysis[analysisID]))
	}

	return sessions, nil
}

func (registry *MemoryRegistry) Get(callerContext context.Context, analysisID string) (domain.OwnedSession, error) {
	if err := callerContext.Err(); err != nil {
		return domain.OwnedSession{}, fmt.Errorf("read live session: %w", err)
	}

	registry.mutex.Lock()
	defer registry.mutex.Unlock()

	session, isLive := registry.byAnalysis[analysisID]
	if !isLive {
		return domain.OwnedSession{}, domain.ErrNotLive
	}

	return copyOf(session), nil
}

func (registry *MemoryRegistry) Save(callerContext context.Context, session domain.OwnedSession) error {
	if err := callerContext.Err(); err != nil {
		return fmt.Errorf("save live session: %w", err)
	}

	registry.mutex.Lock()
	defer registry.mutex.Unlock()

	if _, isLive := registry.byAnalysis[session.AnalysisID]; !isLive {
		registry.order = append(registry.order, session.AnalysisID)
	}

	registry.byAnalysis[session.AnalysisID] = copyOf(session)

	return nil
}

func (registry *MemoryRegistry) Renew(callerContext context.Context, analysisID string, revision domain.Revision) error {
	if err := callerContext.Err(); err != nil {
		return fmt.Errorf("renew live session: %w", err)
	}

	registry.mutex.Lock()
	defer registry.mutex.Unlock()

	if session, isLive := registry.byAnalysis[analysisID]; isLive {
		session.Revision, session.ExpiresAt = revision.Number, revision.ExpiresAt
		registry.byAnalysis[analysisID] = session
	}

	return nil
}

func (registry *MemoryRegistry) Forget(callerContext context.Context, analysisID string) error {
	if err := callerContext.Err(); err != nil {
		return fmt.Errorf("forget live session: %w", err)
	}

	registry.mutex.Lock()
	defer registry.mutex.Unlock()

	delete(registry.byAnalysis, analysisID)
	registry.order = slices.DeleteFunc(registry.order, func(listed string) bool { return listed == analysisID })

	return nil
}

func copyOf(session domain.OwnedSession) domain.OwnedSession {
	session.Key = slices.Clone(session.Key)
	session.Files = slices.Clone(session.Files)

	if session.Log != nil {
		log := *session.Log
		session.Log = &log
	}

	return session
}
