package surface

import (
	"context"

	sharingDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/sharing/domain"
)

// SessionPublication is what the frontend adds to a live publication: the log it holds.
type SessionPublication = sharingDomain.Publication

// SessionStatus is a live session as its owner's frontend shows it.
type SessionStatus = sharingDomain.Status

// JoinedSession is a live session as a viewer's frontend follows it.
type JoinedSession = sharingDomain.Joined

func (operations *Operations) ListSessions(callerContext context.Context) ([]SessionStatus, error) {
	return operations.sharing.List(callerContext)
}

func (operations *Operations) StartSession(callerContext context.Context, analysisID string, publication SessionPublication) (SessionStatus, error) {
	return operations.sharing.Start(callerContext, analysisID, publication)
}

func (operations *Operations) PublishSession(callerContext context.Context, analysisID string, publication SessionPublication) (SessionStatus, error) {
	return operations.sharing.Publish(callerContext, analysisID, publication)
}

func (operations *Operations) SessionStatus(callerContext context.Context, analysisID string) (SessionStatus, error) {
	return operations.sharing.Status(callerContext, analysisID)
}

func (operations *Operations) EndSession(callerContext context.Context, analysisID string) error {
	return operations.sharing.End(callerContext, analysisID)
}

func (operations *Operations) JoinSession(callerContext context.Context, sessionID string, key string) (JoinedSession, error) {
	return operations.sharing.Join(callerContext, sessionID, key)
}

func (operations *Operations) RefreshSession(callerContext context.Context, sessionID string) (JoinedSession, error) {
	return operations.sharing.Refresh(callerContext, sessionID)
}

func (operations *Operations) ForgetSession(callerContext context.Context, sessionID string) error {
	return operations.sharing.Forget(callerContext, sessionID)
}
