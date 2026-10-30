package usecase

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"sync"

	analysisDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/analysis/domain"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/sharing/domain"
)

// followedSession is a session this tab rebuilt from its link: the analysis it rebuilt, the key it
// opens the session's blobs with, the revision it is at, and every file it downloaded, in the
// session's order.
//
// log is the log the last answer named, without its content: the frontend holds the text, and
// keeping it here as well would hold tens of megabytes twice for nothing but recognising the log,
// which its identifier does.
type followedSession struct {
	sessionID  string
	analysisID string
	key        []byte
	revision   domain.Revision
	files      []keptFile
	log        *domain.JoinedLog
}

// keptFile is a downloaded file and the memory path the analysis names it by.
type keptFile struct {
	domain.Blob

	path string
}

// Join rebuilds a session in this tab from the two halves of its link: every file downloaded and
// opened into memory, the analysis created over them and arranged the owner's way. A session this
// tab already follows is brought up to date instead of being rebuilt a second time.
//
// A join that fails after the analysis was created deletes it and lets go of the files, so a
// half-built copy never sits in the library.
func (service *Service) Join(callerContext context.Context, sessionID string, encodedKey string) (domain.Joined, error) {
	if err := service.readyToView(); err != nil {
		return domain.Joined{}, err
	}

	key, err := keyOfLink(sessionID, encodedKey)
	if err != nil {
		return domain.Joined{}, err
	}

	defer service.viewed.lock(sessionID)()

	if followed, isFollowed := service.followed.get(sessionID); isFollowed {
		return service.refresh(callerContext, followed)
	}

	view := service.viewerRunOf(sessionID, key)

	sealed, err := service.host.State(callerContext, sessionID)
	if err != nil {
		return domain.Joined{}, fmt.Errorf("join the session: %w", err)
	}

	state, err := view.open(sealed)
	if err != nil {
		return domain.Joined{}, err
	}

	kept, err := view.keepFiles(callerContext, state.Files)
	if err != nil {
		return domain.Joined{}, err
	}

	analysisID, err := service.library.Create(callerContext, state.Name, sourcesOf(kept))
	if err != nil {
		service.forgetKept(kept)

		return domain.Joined{}, fmt.Errorf("rebuild the shared analysis: %w", err)
	}

	followed := followedSession{sessionID: sessionID, analysisID: analysisID, key: key, revision: sealed.Revision, files: kept}

	followed, log, err := view.catchUp(callerContext, followed, state)
	if err != nil {
		return domain.Joined{}, errors.Join(err, service.abandon(callerContext, followed))
	}

	service.followed.put(followed)

	return service.joinedOf(followed, true, log), nil
}

// Refresh brings a followed session up to the revision the service holds, and says whether there
// was anything newer.
func (service *Service) Refresh(callerContext context.Context, sessionID string) (domain.Joined, error) {
	if err := service.readyToView(); err != nil {
		return domain.Joined{}, err
	}

	defer service.viewed.lock(sessionID)()

	followed, isFollowed := service.followed.get(sessionID)
	if !isFollowed {
		return domain.Joined{}, domain.ErrNotFollowed
	}

	return service.refresh(callerContext, followed)
}

// refresh appends the files the owner added, in order, and lays the owner's arrangement and log over
// the analysis. The files are recorded as soon as the analysis holds them, so a refresh that fails
// after adding them does not add them a second time on the next try. The log is answered without
// its content whenever it is the one the previous answer carried.
func (service *Service) refresh(callerContext context.Context, followed followedSession) (domain.Joined, error) {
	view := service.viewerRunOf(followed.sessionID, followed.key)

	sealed, err := service.host.State(callerContext, followed.sessionID)
	if err != nil {
		return domain.Joined{}, fmt.Errorf("refresh the session: %w", err)
	}

	if sealed.Revision.Number <= followed.revision.Number {
		followed.revision.ExpiresAt = sealed.Revision.ExpiresAt
		service.followed.put(followed)

		return service.joinedOf(followed, false, followed.log), nil
	}

	state, err := view.open(sealed)
	if err != nil {
		return domain.Joined{}, err
	}

	added, err := appendedFiles(followed.files, state.Files)
	if err != nil {
		return domain.Joined{}, err
	}

	kept, err := view.keepFiles(callerContext, added)
	if err != nil {
		return domain.Joined{}, err
	}

	if len(kept) > 0 {
		if err := service.library.AddSources(callerContext, followed.analysisID, sourcesOf(kept)); err != nil {
			service.forgetKept(kept)

			return domain.Joined{}, fmt.Errorf("add the shared sources: %w", err)
		}

		followed.files = append(followed.files, kept...)
		service.followed.put(followed)
	}

	followed, log, err := view.catchUp(callerContext, followed, state)
	if err != nil {
		return domain.Joined{}, err
	}

	followed.revision = sealed.Revision
	service.followed.put(followed)

	return service.joinedOf(followed, true, log), nil
}

// Forget deletes a followed session's analysis from this tab and lets go of its files: the session
// ended, and nothing of it is to stay behind.
func (service *Service) Forget(callerContext context.Context, sessionID string) error {
	if err := service.readyToView(); err != nil {
		return err
	}

	defer service.viewed.lock(sessionID)()

	followed, isFollowed := service.followed.take(sessionID)
	if !isFollowed {
		return domain.ErrNotFollowed
	}

	return service.abandon(callerContext, followed)
}

// abandon deletes a followed session's analysis and lets go of its files. An analysis a person
// already deleted is nothing left to delete.
func (service *Service) abandon(callerContext context.Context, followed followedSession) error {
	err := service.library.Delete(callerContext, followed.analysisID)
	service.forgetKept(followed.files)

	if err != nil && !errors.Is(err, analysisDomain.ErrAnalysisNotFound) {
		return fmt.Errorf("delete the shared analysis: %w", err)
	}

	return nil
}

// releaseFollowed lets go of the files of the session that follows an analysis about to be
// deleted. It takes the session under that session's lock: a refresh still running would otherwise
// put it back when it ends, with every file it kept, against an analysis that is gone.
func (service *Service) releaseFollowed(analysisID string) {
	sessionID, isFollowed := service.followed.sessionFollowing(analysisID)
	if !isFollowed {
		return
	}

	defer service.viewed.lock(sessionID)()

	service.forgetKept(service.followed.takeByAnalysis(analysisID).files)
}

func (service *Service) forgetKept(files []keptFile) {
	for _, file := range files {
		service.keeper.Forget(file.path)
	}
}

// joinedOf is the answer about a followed session, with the log as this answer carries it.
func (service *Service) joinedOf(followed followedSession, changed bool, log *domain.JoinedLog) domain.Joined {
	return domain.Joined{
		SessionID:             followed.sessionID,
		AnalysisID:            followed.analysisID,
		Revision:              followed.revision.Number,
		ExpiresAtMilliseconds: followed.revision.ExpiresAt.UnixMilli(),
		LiveURL:               service.host.LiveURL(followed.sessionID),
		Changed:               changed,
		Log:                   log,
	}
}

// viewerRunOf opens a session's blobs with a key keyOfLink already checked the length of, which is
// the only way newSealer refuses one.
func (service *Service) viewerRunOf(sessionID string, key []byte) viewerRun {
	sealing, _ := newSealer(key, service.entropy)

	return viewerRun{service: service, sealing: sealing, sessionID: sessionID}
}

// viewerRun is one join or refresh of a session.
type viewerRun struct {
	service   *Service
	sealing   sealer
	sessionID string
}

// open reads a sealed state. A state the key does not open is a link with the wrong key; one that
// opens but does not read, or is in another format, was written by an application this one cannot
// follow.
func (view viewerRun) open(sealed domain.SealedState) (domain.State, error) {
	plaintext, opened := view.sealing.open(stateAdditionalData(view.sessionID), sealed.Sealed)
	if !opened {
		return domain.State{}, domain.ErrKeyRefused
	}

	var state domain.State
	if err := json.Unmarshal(plaintext, &state); err != nil {
		return domain.State{}, fmt.Errorf("%w: the state does not read: %w", domain.ErrServiceFailed, err)
	}

	if state.Format != domain.StateFormat {
		return domain.State{}, fmt.Errorf("%w: the state is in format %d, this application reads %d", domain.ErrServiceFailed, state.Format, domain.StateFormat)
	}

	return state, nil
}

// keepFiles downloads every file and keeps it in memory, in order. A download that fails lets go of
// the files kept before it.
func (view viewerRun) keepFiles(callerContext context.Context, files []domain.Blob) ([]keptFile, error) {
	kept := make([]keptFile, 0, len(files))
	for _, file := range files {
		content, err := view.download(callerContext, file)
		if err != nil {
			view.service.forgetKept(kept)

			return nil, fmt.Errorf("download %q: %w", file.Name, err)
		}

		kept = append(kept, keptFile{Blob: file, path: view.service.keeper.Keep(file.Name, content)})
	}

	return kept, nil
}

// download reads a file's chunks in order and opens each. The state was opened with the session's
// key, so a chunk that does not open, or a file that comes out another size than the state says, was
// changed by the service rather than written by the owner.
//
// The chunks are joined once, after their sizes add up to the file's: the size the state declares
// is not trusted to size a buffer before the chunks bear it out.
func (view viewerRun) download(callerContext context.Context, blob domain.Blob) ([]byte, error) {
	var chunks [][]byte

	downloaded := 0

	for index := range blob.ChunkCount {
		sealed, err := view.service.host.Chunk(callerContext, view.sessionID, blob.FileID, index)
		if err != nil {
			return nil, err
		}

		chunk, opened := view.sealing.open(chunkAdditionalData(view.sessionID, blob.FileID, index), sealed)
		if !opened {
			return nil, fmt.Errorf("%w: chunk %d does not open with the session's key", domain.ErrServiceFailed, index)
		}

		chunks = append(chunks, chunk)
		downloaded += len(chunk)
	}

	if int64(downloaded) != blob.Size {
		return nil, fmt.Errorf("%w: the file holds %d bytes, the state says %d", domain.ErrServiceFailed, downloaded, blob.Size)
	}

	return slices.Concat(chunks...), nil
}

// catchUp arranges the analysis the owner's way and brings the log in line with the state's. It
// answers with the log as this answer carries it, and keeps it without its content.
func (view viewerRun) catchUp(callerContext context.Context, followed followedSession, state domain.State) (followedSession, *domain.JoinedLog, error) {
	arrangement := domain.Arrangement{Name: state.Name, Canvas: state.Canvas, LibraryOrder: state.LibraryOrder, SeriesColors: state.SeriesColors}
	if err := view.service.library.Arrange(callerContext, followed.analysisID, arrangement); err != nil {
		return followed, nil, fmt.Errorf("arrange the shared analysis: %w", err)
	}

	log, err := view.logOf(callerContext, state.Log, followed.log)
	if err != nil {
		return followed, nil, err
	}

	followed.log = withoutContent(log)

	return followed, log, nil
}

// logOf is the log a state names. One the previous answer already carried is named without its
// content; any other is downloaded, and carries it.
func (view viewerRun) logOf(callerContext context.Context, stateLog *domain.StateLog, held *domain.JoinedLog) (*domain.JoinedLog, error) {
	if stateLog == nil {
		return nil, nil
	}

	if held != nil && held.FileID == stateLog.FileID {
		return &domain.JoinedLog{FileID: held.FileID, Name: held.Name, View: stateLog.View}, nil
	}

	content, err := view.download(callerContext, stateLog.Blob)
	if err != nil {
		return nil, fmt.Errorf("download the log %q: %w", stateLog.Name, err)
	}

	return &domain.JoinedLog{FileID: stateLog.FileID, Name: stateLog.Name, Content: string(content), View: stateLog.View}, nil
}

func withoutContent(log *domain.JoinedLog) *domain.JoinedLog {
	if log == nil {
		return nil
	}

	named := *log
	named.Content = ""

	return &named
}

// appendedFiles is the files a state lists after the ones already followed. Sources are only ever
// appended, so a state that does not start with the files already held was not written by the owner
// this tab follows.
func appendedFiles(held []keptFile, listed []domain.Blob) ([]domain.Blob, error) {
	if len(listed) < len(held) {
		return nil, fmt.Errorf("%w: the session lists fewer files than this tab holds", domain.ErrServiceFailed)
	}

	for index, file := range held {
		if listed[index].FileID != file.FileID {
			return nil, fmt.Errorf("%w: the session's file %d is not the one this tab holds", domain.ErrServiceFailed, index)
		}
	}

	return listed[len(held):], nil
}

func sourcesOf(kept []keptFile) []analysisDomain.SourceFile {
	files := make([]analysisDomain.SourceFile, 0, len(kept))
	for _, file := range kept {
		files = append(files, analysisDomain.SourceFile{Name: file.Name, Path: file.path, Size: file.Size})
	}

	return files
}

// followedSessions is the sessions this tab follows, by session.
type followedSessions struct {
	mutex     sync.Mutex
	bySession map[string]followedSession
}

func newFollowedSessions() *followedSessions {
	return &followedSessions{bySession: make(map[string]followedSession)}
}

func (sessions *followedSessions) get(sessionID string) (followedSession, bool) {
	sessions.mutex.Lock()
	defer sessions.mutex.Unlock()

	followed, isFollowed := sessions.bySession[sessionID]

	return followed, isFollowed
}

func (sessions *followedSessions) put(followed followedSession) {
	sessions.mutex.Lock()
	defer sessions.mutex.Unlock()

	sessions.bySession[followed.sessionID] = followed
}

func (sessions *followedSessions) take(sessionID string) (followedSession, bool) {
	sessions.mutex.Lock()
	defer sessions.mutex.Unlock()

	followed, isFollowed := sessions.bySession[sessionID]
	delete(sessions.bySession, sessionID)

	return followed, isFollowed
}

// sessionFollowing is the session that follows an analysis, if any does.
func (sessions *followedSessions) sessionFollowing(analysisID string) (string, bool) {
	sessions.mutex.Lock()
	defer sessions.mutex.Unlock()

	for sessionID, followed := range sessions.bySession {
		if followed.analysisID == analysisID {
			return sessionID, true
		}
	}

	return "", false
}

// takeByAnalysis takes the session that follows an analysis. A session forgotten while the caller
// waited for its lock is no longer there, and the answer is then no session, which holds no files.
func (sessions *followedSessions) takeByAnalysis(analysisID string) followedSession {
	sessions.mutex.Lock()
	defer sessions.mutex.Unlock()

	var taken followedSession

	for sessionID, followed := range sessions.bySession {
		if followed.analysisID == analysisID {
			taken = followed
			delete(sessions.bySession, sessionID)
		}
	}

	return taken
}
