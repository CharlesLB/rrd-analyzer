package domain

import "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/shared/failure"

const (
	ErrNotConfigured      failure.Error = "sharing: this build was given no share service to publish to"
	ErrViewingUnavailable failure.Error = "sharing: following a session needs a place to keep its files in memory, which only the browser edition has"
	ErrNotLive            failure.Error = "sharing: this analysis is not shared live"
	ErrNotFollowed        failure.Error = "sharing: this tab follows no session with that identifier"
	ErrSessionEnded       failure.Error = "sharing: the session has ended, or never existed"
	ErrLinkInvalid        failure.Error = "sharing: the link does not name a session and its key"
	ErrKeyRefused         failure.Error = "sharing: the link's key does not open this session"
	ErrTooLarge           failure.Error = "sharing: the session would hold more than the share service keeps"
	ErrServiceBusy        failure.Error = "sharing: the share service is refusing new sessions for now"
	ErrServiceFailed      failure.Error = "sharing: the share service could not be reached, or answered something unexpected"
	ErrLogContentMissing  failure.Error = "sharing: a log the session does not hold yet has to be published with its content"
	ErrLogViewInvalid     failure.Error = "sharing: a log's view has to be JSON"
	ErrSourceUnlocated    failure.Error = "sharing: a source with no path has nothing on disk to publish"
	ErrSourceUnreadable   failure.Error = "sharing: a source could not be read to be published"
	ErrNotASource         failure.Error = "sharing: only RRD databases and dumps are published"
)
