// Package usecase publishes an analysis as a live session and rebuilds one from its link: the owner
// side seals and uploads, the viewer side downloads and opens, and both speak the protocol in
// docs/SHARING.md through the ports of the domain.
package usecase

import (
	"sync"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/sharing/domain"
)

// Dependencies is everything the live sessions reach the world through.
//
// Host is nil, and ServiceURL empty, in a build that was given no share service: every operation
// then reports ErrNotConfigured. Keeper is nil wherever files cannot be kept in memory, which is
// everywhere but the browser edition, and following a session there reports ErrViewingUnavailable.
// Every other field is required.
type Dependencies struct {
	ServiceURL string
	Host       domain.Host
	Registry   domain.Registry
	Library    domain.Library
	Reader     domain.SourceReader
	Format     domain.SourceFormat
	Entropy    domain.Entropy
	Clock      domain.Clock
	Keeper     domain.FileKeeper
}

type Service struct {
	serviceURL string
	host       domain.Host
	registry   domain.Registry
	library    domain.Library
	reader     domain.SourceReader
	format     domain.SourceFormat
	entropy    domain.Entropy
	clock      domain.Clock
	keeper     domain.FileKeeper

	// owned serialises the publications of one analysis, and viewed the refreshes of one session: two
	// at once would both upload the same new file, or both add it to the viewer's analysis.
	owned  *keyedLocks
	viewed *keyedLocks

	followed *followedSessions
}

func NewService(dependencies Dependencies) *Service {
	if dependencies.Registry == nil || dependencies.Library == nil || dependencies.Reader == nil || dependencies.Format == nil ||
		dependencies.Entropy == nil || dependencies.Clock == nil {
		panic("sharing service: the registry, the library, the source reader, the source format, the entropy and the clock are all required")
	}

	if (dependencies.Host == nil) != (dependencies.ServiceURL == "") {
		panic("sharing service: a share service needs both its address and its client, or neither")
	}

	return &Service{
		serviceURL: dependencies.ServiceURL,
		host:       dependencies.Host,
		registry:   dependencies.Registry,
		library:    dependencies.Library,
		reader:     dependencies.Reader,
		format:     dependencies.Format,
		entropy:    dependencies.Entropy,
		clock:      dependencies.Clock,
		keeper:     dependencies.Keeper,
		owned:      newKeyedLocks(),
		viewed:     newKeyedLocks(),
		followed:   newFollowedSessions(),
	}
}

// SharesSessions says whether this build was given a share service, which is whether the frontend
// offers a share button at all.
func (service *Service) SharesSessions() bool {
	return service.host != nil
}

func (service *Service) ready() error {
	if service.host == nil {
		return domain.ErrNotConfigured
	}

	return nil
}

func (service *Service) readyToView() error {
	if err := service.ready(); err != nil {
		return err
	}

	if service.keeper == nil {
		return domain.ErrViewingUnavailable
	}

	return nil
}

// keyedLocks hands out one mutex per key, created the first time the key is locked. Keys are
// analyses and sessions a person opened, a handful, so none is ever removed.
type keyedLocks struct {
	mutex sync.Mutex
	held  map[string]*sync.Mutex
}

func newKeyedLocks() *keyedLocks {
	return &keyedLocks{held: make(map[string]*sync.Mutex)}
}

// lock holds key until the function it answers with is called.
func (locks *keyedLocks) lock(key string) func() {
	locks.mutex.Lock()

	held, exists := locks.held[key]
	if !exists {
		held = &sync.Mutex{}
		locks.held[key] = held
	}

	locks.mutex.Unlock()
	held.Lock()

	return held.Unlock
}
