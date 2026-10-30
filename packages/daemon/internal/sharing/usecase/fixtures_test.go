package usecase_test

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"maps"
	"slices"
	"strings"
	"testing"
	"time"

	analysisDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/analysis/domain"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/shared/memoryfiles"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/sharing/domain"
	sharingInfra "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/sharing/infrastructure"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/sharing/sharetest"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/sharing/usecase"
)

const (
	ownedAnalysis  = "owned"
	sourcePrefix   = "RRD "
	nonceBytes     = 12
	logName        = "service.ndjson"
	logContent     = `{"time":"2026-03-12T09:30:00Z","level":"error"}`
	logView        = `{"mapping":{"time":"time"}}`
	sourcesOfOwner = 2

	// releaseHeadStart is how long a refresh caught downloading waits for a release begun beside it,
	// which is long enough for one that does not wait for the refresh to be over.
	releaseHeadStart = 200 * time.Millisecond
)

var (
	errLibraryUnavailable  = errors.New("the library cannot be reached")
	errRegistryUnavailable = errors.New("the registry cannot be reached")
	errHostRefused         = fmt.Errorf("%w: refused by the test", domain.ErrServiceFailed)
	cpuSource              = analysisDomain.SourceFile{Name: "cpu.rrd", Path: "/srv/cpu.rrd", Size: 7}
	memorySource           = analysisDomain.SourceFile{Name: "memory.rrd", Path: "/srv/memory.rrd", Size: 10}
	diskSource             = analysisDomain.SourceFile{Name: "disk.rrd", Path: "/srv/disk.rrd", Size: 8}
	ownersCanvas           = []analysisDomain.CanvasChart{{SeriesID: "s0", Label: "cpu", Merged: []analysisDomain.MergedSeries{}}}
	ownersOrder            = []analysisDomain.ChartReference{{SeriesID: "s1", Label: "memory"}, {SeriesID: "s0", Label: "cpu"}}
	ownersColors           = []analysisDomain.SeriesColor{{SeriesID: "s0", Label: "cpu", Color: "#112233"}}
)

// libraryOperation names the one operation of a fakeLibrary that fails.
type libraryOperation int

const (
	analysisOperation libraryOperation = iota + 1
	createOperation
	addSourcesOperation
	arrangeOperation
	deleteOperation
)

// fakeLibrary is the analysis library in memory. Its one failing operation answers
// errLibraryUnavailable, and the zero value fails nothing.
type fakeLibrary struct {
	analyses map[string]analysisDomain.Analysis
	created  int
	failing  libraryOperation
}

func newFakeLibrary() *fakeLibrary {
	return &fakeLibrary{analyses: make(map[string]analysisDomain.Analysis)}
}

func (library *fakeLibrary) refusal(operation libraryOperation) error {
	if library.failing == operation {
		return errLibraryUnavailable
	}

	return nil
}

func (library *fakeLibrary) Analysis(_ context.Context, analysisID string) (analysisDomain.Analysis, error) {
	if err := library.refusal(analysisOperation); err != nil {
		return analysisDomain.Analysis{}, err
	}

	analysis, isHeld := library.analyses[analysisID]
	if !isHeld {
		return analysisDomain.Analysis{}, fmt.Errorf("%q: %w", analysisID, analysisDomain.ErrAnalysisNotFound)
	}

	return analysis, nil
}

func (library *fakeLibrary) Create(_ context.Context, name string, files []analysisDomain.SourceFile) (string, error) {
	if err := library.refusal(createOperation); err != nil {
		return "", err
	}

	library.created++
	analysisID := fmt.Sprintf("viewed-%d", library.created)
	library.analyses[analysisID] = analysisDomain.Analysis{ID: analysisID, Name: name, Files: slices.Clone(files)}

	return analysisID, nil
}

func (library *fakeLibrary) AddSources(_ context.Context, analysisID string, files []analysisDomain.SourceFile) error {
	if err := library.refusal(addSourcesOperation); err != nil {
		return err
	}

	analysis := library.analyses[analysisID]
	analysis.Files = append(slices.Clone(analysis.Files), files...)
	library.analyses[analysisID] = analysis

	return nil
}

func (library *fakeLibrary) Arrange(_ context.Context, analysisID string, arrangement domain.Arrangement) error {
	if err := library.refusal(arrangeOperation); err != nil {
		return err
	}

	analysis := library.analyses[analysisID]
	analysis.Name, analysis.Canvas, analysis.LibraryOrder, analysis.SeriesColors = arrangement.Name, arrangement.Canvas, arrangement.LibraryOrder, arrangement.SeriesColors
	library.analyses[analysisID] = analysis

	return nil
}

func (library *fakeLibrary) Delete(_ context.Context, analysisID string) error {
	if err := library.refusal(deleteOperation); err != nil {
		return err
	}

	if _, isHeld := library.analyses[analysisID]; !isHeld {
		return fmt.Errorf("%q: %w", analysisID, analysisDomain.ErrAnalysisNotFound)
	}

	delete(library.analyses, analysisID)

	return nil
}

// grow adds a source to an analysis the way a person adding a file does.
func (library *fakeLibrary) grow(analysisID string, file analysisDomain.SourceFile) {
	analysis := library.analyses[analysisID]
	analysis.Files = append(slices.Clone(analysis.Files), file)
	library.analyses[analysisID] = analysis
}

// diskReader is the files on disk, by path.
type diskReader map[string][]byte

func (reader diskReader) Read(_ context.Context, path string) ([]byte, error) {
	content, isOnDisk := reader[path]
	if !isOnDisk {
		return nil, fmt.Errorf("read %q: no such file", path)
	}

	return content, nil
}

// prefixFormat recognises a source by the four bytes every test source starts with.
type prefixFormat struct{}

func (prefixFormat) Recognises(content []byte) bool {
	return strings.HasPrefix(string(content), sourcePrefix)
}

// countingEntropy fills every buffer with the next number, so every identifier and nonce differs and
// a run seals the same bytes every time.
type countingEntropy struct {
	filled byte
}

func (entropy *countingEntropy) Fill(buffer []byte) {
	entropy.filled++
	for index := range buffer {
		buffer[index] = entropy.filled
	}
}

type fixedClock struct{}

func (fixedClock) Now() time.Time { return time.Date(2026, time.March, 12, 9, 30, 0, 0, time.UTC) }

// registryOperation names the one operation of a failingRegistry that fails.
type registryOperation int

const (
	listRegistryOperation registryOperation = iota + 1
	getRegistryOperation
	renewRegistryOperation
	forgetRegistryOperation
)

// failingRegistry is a registry in memory whose one operation fails, and whose saves fail from the
// failingSave-th one on, so a test can let a publication get as far as it needs.
type failingRegistry struct {
	*sharingInfra.MemoryRegistry

	failing     registryOperation
	saves       int
	failingSave int
}

func (registry *failingRegistry) refusal(operation registryOperation) error {
	if registry.failing == operation {
		return errRegistryUnavailable
	}

	return nil
}

func (registry *failingRegistry) List(callerContext context.Context) ([]domain.OwnedSession, error) {
	if err := registry.refusal(listRegistryOperation); err != nil {
		return nil, err
	}

	return registry.MemoryRegistry.List(callerContext)
}

func (registry *failingRegistry) Get(callerContext context.Context, analysisID string) (domain.OwnedSession, error) {
	if err := registry.refusal(getRegistryOperation); err != nil {
		return domain.OwnedSession{}, err
	}

	return registry.MemoryRegistry.Get(callerContext, analysisID)
}

func (registry *failingRegistry) Save(callerContext context.Context, session domain.OwnedSession) error {
	registry.saves++
	if registry.failingSave != 0 && registry.saves >= registry.failingSave {
		return errRegistryUnavailable
	}

	return registry.MemoryRegistry.Save(callerContext, session)
}

func (registry *failingRegistry) Renew(callerContext context.Context, analysisID string, sessionID string, revision domain.Revision) error {
	if err := registry.refusal(renewRegistryOperation); err != nil {
		return err
	}

	return registry.MemoryRegistry.Renew(callerContext, analysisID, sessionID, revision)
}

func (registry *failingRegistry) Forget(callerContext context.Context, analysisID string, sessionID string) error {
	if err := registry.refusal(forgetRegistryOperation); err != nil {
		return err
	}

	return registry.MemoryRegistry.Forget(callerContext, analysisID, sessionID)
}

// forgetOwned forgets the session the registry keeps for an analysis, the way a session never
// started leaves it.
func (registry *failingRegistry) forgetOwned(analysisID string) {
	session, _ := registry.Get(context.Background(), analysisID)
	_ = registry.Forget(context.Background(), analysisID, session.SessionID)
}

// scriptedHost is a share service whose calls a test can answer itself; every call it does not
// script goes to the service underneath.
type scriptedHost struct {
	domain.Host

	create   func() (domain.CreatedSession, error)
	putChunk func(fileID string, index int, sealed []byte) error
	putState func(sealed []byte) (domain.Revision, error)
	state    func(sealed domain.SealedState) (domain.SealedState, error)
	chunk    func(fileID string, index int, sealed []byte) ([]byte, error)
	status   func() (domain.Revision, error)
	end      func() error

	putChunks int
}

func (host *scriptedHost) Create(callerContext context.Context) (domain.CreatedSession, error) {
	if host.create != nil {
		return host.create()
	}

	return host.Host.Create(callerContext)
}

func (host *scriptedHost) PutChunk(callerContext context.Context, credentials domain.Credentials, fileID string, index int, sealed []byte) error {
	host.putChunks++
	if host.putChunk != nil {
		if err := host.putChunk(fileID, index, sealed); err != nil {
			return err
		}
	}

	return host.Host.PutChunk(callerContext, credentials, fileID, index, sealed)
}

func (host *scriptedHost) PutState(callerContext context.Context, credentials domain.Credentials, sealed []byte) (domain.Revision, error) {
	if host.putState != nil {
		return host.putState(sealed)
	}

	return host.Host.PutState(callerContext, credentials, sealed)
}

func (host *scriptedHost) State(callerContext context.Context, sessionID string) (domain.SealedState, error) {
	held, err := host.Host.State(callerContext, sessionID)
	if host.state != nil {
		return host.state(held)
	}

	return held, err
}

func (host *scriptedHost) Chunk(callerContext context.Context, sessionID string, fileID string, index int) ([]byte, error) {
	held, err := host.Host.Chunk(callerContext, sessionID, fileID, index)
	if host.chunk != nil {
		return host.chunk(fileID, index, held)
	}

	return held, err
}

func (host *scriptedHost) Status(callerContext context.Context, sessionID string) (domain.Revision, error) {
	if host.status != nil {
		return host.status()
	}

	return host.Host.Status(callerContext, sessionID)
}

func (host *scriptedHost) End(callerContext context.Context, credentials domain.Credentials) error {
	if host.end != nil {
		return host.end()
	}

	return host.Host.End(callerContext, credentials)
}

// world is one share service with an owner publishing to it and a viewer following from it.
type world struct {
	server  *sharetest.Server
	host    *scriptedHost
	owner   party
	viewer  party
	keeper  *memoryfiles.Files
	content diskReader
}

// party is one app: its sharing service and the library and registry under it.
type party struct {
	service  *usecase.Service
	library  *fakeLibrary
	registry *failingRegistry
}

func newWorld(t *testing.T) *world {
	t.Helper()

	server := sharetest.Started(t)

	host := &scriptedHost{Host: sharingInfra.NewHostClient(server.URL())}
	content := diskReader{cpuSource.Path: []byte("RRD cpu"), memorySource.Path: []byte("RRD memory"), diskSource.Path: []byte("RRD disk")}
	keeper := memoryfiles.New()

	ownerLibrary := newFakeLibrary()
	ownerLibrary.analyses[ownedAnalysis] = analysisDomain.Analysis{
		ID:           ownedAnalysis,
		Name:         "Checkout",
		Files:        []analysisDomain.SourceFile{cpuSource, memorySource},
		Canvas:       ownersCanvas,
		LibraryOrder: ownersOrder,
		SeriesColors: ownersColors,
	}

	return &world{
		server:  server,
		host:    host,
		owner:   newParty(server.URL(), host, ownerLibrary, content, nil),
		viewer:  newParty(server.URL(), host, newFakeLibrary(), diskReader{}, keeper),
		keeper:  keeper,
		content: content,
	}
}

func newParty(serviceURL string, host domain.Host, library *fakeLibrary, reader diskReader, keeper domain.FileKeeper) party {
	registry := &failingRegistry{MemoryRegistry: sharingInfra.NewMemoryRegistry()}

	return party{
		service: usecase.NewService(usecase.Dependencies{
			ServiceURL: serviceURL,
			Host:       host,
			Registry:   registry,
			Library:    library,
			Reader:     reader,
			Format:     prefixFormat{},
			Entropy:    &countingEntropy{},
			Clock:      fixedClock{},
			Keeper:     keeper,
		}),
		library:  library,
		registry: registry,
	}
}

func withLog(content string) domain.Publication {
	return domain.Publication{Log: &domain.PublishedLog{Name: logName, Content: &content, View: []byte(logView)}}
}

// started shares the owner's analysis with its log and answers with the status.
func (shared *world) started(t *testing.T) domain.Status {
	t.Helper()

	status, err := shared.owner.service.Start(context.Background(), ownedAnalysis, withLog(logContent))
	if err != nil {
		t.Fatalf("start: %v", err)
	}

	return status
}

// joined has the viewer follow the link of a status.
func (shared *world) joined(t *testing.T, status domain.Status) domain.Joined {
	t.Helper()

	sessionID, key := sharetest.HalvesOf(status.Link)

	joined, err := shared.viewer.service.Join(context.Background(), sessionID, key)
	if err != nil {
		t.Fatalf("join: %v", err)
	}

	return joined
}

// keyOf decodes the key half of a link, for a test that seals a state of its own.
func keyOf(t *testing.T, link string) []byte {
	t.Helper()

	_, encoded := sharetest.HalvesOf(link)

	key, err := base64.RawURLEncoding.DecodeString(encoded)
	if err != nil {
		t.Fatalf("decode the key: %v", err)
	}

	return key
}

// sessionCipher is the AES-GCM a session's blobs are sealed with, written from docs/SHARING.md rather
// than taken from the code under test, for a test that seals or opens a state itself.
func sessionCipher(t *testing.T, key []byte) cipher.AEAD {
	t.Helper()

	block, err := aes.NewCipher(key)
	if err != nil {
		t.Fatalf("cipher: %v", err)
	}

	aead, err := cipher.NewGCM(block)
	if err != nil {
		t.Fatalf("gcm: %v", err)
	}

	return aead
}

// stateAdditionalData is the place a session's state is sealed at.
func stateAdditionalData(sessionID string) []byte {
	return []byte("rrd-analyzer/1/" + sessionID + "/state")
}

// sealedState seals a state a test writes itself, the way the owner does.
func sealedState(t *testing.T, key []byte, sessionID string, plaintext []byte) []byte {
	t.Helper()

	nonce := make([]byte, nonceBytes)

	return sessionCipher(t, key).Seal(nonce, nonce, plaintext, stateAdditionalData(sessionID))
}

// openedState opens a sealed state the way a viewer does, for a test that rewrites it.
func openedState(t *testing.T, key []byte, sessionID string, sealed []byte) domain.State {
	t.Helper()

	plaintext, err := sessionCipher(t, key).Open(nil, sealed[:nonceBytes], sealed[nonceBytes:], stateAdditionalData(sessionID))
	if err != nil {
		t.Fatalf("open the state: %v", err)
	}

	var state domain.State
	if err := json.Unmarshal(plaintext, &state); err != nil {
		t.Fatalf("read the state: %v", err)
	}

	return state
}

// keptPaths is every path a keeper still holds content under, among paths.
func keptPaths(keeper *memoryfiles.Files, analysis analysisDomain.Analysis) []string {
	held := []string{}
	for _, file := range analysis.Files {
		if exists, _ := keeper.Exists(context.Background(), file.Path); exists {
			held = append(held, file.Path)
		}
	}

	return held
}

// onlyViewedAnalysis is the one analysis a viewer's library holds.
func onlyViewedAnalysis(t *testing.T, library *fakeLibrary) analysisDomain.Analysis {
	t.Helper()

	analyses := slices.Collect(maps.Values(library.analyses))
	if len(analyses) != 1 {
		t.Fatalf("the viewer's library holds %d analyses, want 1", len(analyses))
	}

	return analyses[0]
}
