package usecase

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sync"

	analysisDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/analysis/domain"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/sharing/domain"
)

// followedSession is a session this tab rebuilt from its link: the analysis it rebuilt, the key it
// opens the session's blobs with, the revision it is at, and every file it downloaded, in the
// session's order.
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
	fileID string
	name   string
	path   string
	size   int64
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

	followed, err = view.catchUp(callerContext, followed, state)
	if err != nil {
		return domain.Joined{}, errors.Join(err, service.abandon(callerContext, followed))
	}

	service.followed.put(followed)

	return service.joinedOf(followed, true), nil
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
// after adding them does not add them a second time on the next try.
func (service *Service) refresh(callerContext context.Context, followed followedSession) (domain.Joined, error) {
	view := service.viewerRunOf(followed.sessionID, followed.key)

	sealed, err := service.host.State(callerContext, followed.sessionID)
	if err != nil {
		return domain.Joined{}, fmt.Errorf("refresh the session: %w", err)
	}

	if sealed.Revision.Number <= followed.revision.Number {
		followed.revision.ExpiresAt = sealed.Revision.ExpiresAt
		service.followed.put(followed)

		return service.joinedOf(followed, false), nil
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

	followed, err = view.catchUp(callerContext, followed, state)
	if err != nil {
		return domain.Joined{}, err
	}

	followed.revision = sealed.Revision
	service.followed.put(followed)

	return service.joinedOf(followed, true), nil
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

func (service *Service) forgetKept(files []keptFile) {
	for _, file := range files {
		service.keeper.Forget(file.path)
	}
}

func (service *Service) joinedOf(followed followedSession, changed bool) domain.Joined {
	return domain.Joined{
		SessionID:             followed.sessionID,
		AnalysisID:            followed.analysisID,
		Revision:              followed.revision.Number,
		ExpiresAtMilliseconds: followed.revision.ExpiresAt.UnixMilli(),
		LiveURL:               service.liveURLOf(followed.sessionID),
		Changed:               changed,
		Log:                   followed.log,
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
func (view viewerRun) keepFiles(callerContext context.Context, files []domain.StateFile) ([]keptFile, error) {
	kept := make([]keptFile, 0, len(files))
	for _, file := range files {
		content, err := view.download(callerContext, file.FileID, file.Size, file.ChunkCount)
		if err != nil {
			view.service.forgetKept(kept)

			return nil, fmt.Errorf("download %q: %w", file.Name, err)
		}

		kept = append(kept, keptFile{fileID: file.FileID, name: file.Name, path: view.service.keeper.Keep(file.Name, content), size: file.Size})
	}

	return kept, nil
}

// download reads a file's chunks in order and opens each. The state was opened with the session's
// key, so a chunk that does not open, or a file that comes out another size than the state says, was
// changed by the service rather than written by the owner.
func (view viewerRun) download(callerContext context.Context, fileID string, size int64, chunkCount int) ([]byte, error) {
	var content []byte

	for index := range chunkCount {
		sealed, err := view.service.host.Chunk(callerContext, view.sessionID, fileID, index)
		if err != nil {
			return nil, err
		}

		chunk, opened := view.sealing.open(chunkAdditionalData(view.sessionID, fileID, index), sealed)
		if !opened {
			return nil, fmt.Errorf("%w: chunk %d does not open with the session's key", domain.ErrServiceFailed, index)
		}

		content = append(content, chunk...)
	}

	if int64(len(content)) != size {
		return nil, fmt.Errorf("%w: the file holds %d bytes, the state says %d", domain.ErrServiceFailed, len(content), size)
	}

	return content, nil
}

// catchUp arranges the analysis the owner's way and brings the log in line with the state's.
func (view viewerRun) catchUp(callerContext context.Context, followed followedSession, state domain.State) (followedSession, error) {
	arrangement := domain.Arrangement{Name: state.Name, Canvas: state.Canvas, LibraryOrder: state.LibraryOrder, SeriesColors: state.SeriesColors}
	if err := view.service.library.Arrange(callerContext, followed.analysisID, arrangement); err != nil {
		return followed, fmt.Errorf("arrange the shared analysis: %w", err)
	}

	log, err := view.logOf(callerContext, state.Log, followed.log)
	if err != nil {
		return followed, err
	}

	followed.log = log

	return followed, nil
}

// logOf is the log a state names, downloaded only when it is not the one already held.
func (view viewerRun) logOf(callerContext context.Context, stateLog *domain.StateLog, held *domain.JoinedLog) (*domain.JoinedLog, error) {
	if stateLog == nil {
		return nil, nil
	}

	if held != nil && held.FileID == stateLog.FileID {
		return &domain.JoinedLog{FileID: held.FileID, Name: held.Name, Content: held.Content, View: stateLog.View}, nil
	}

	content, err := view.download(callerContext, stateLog.FileID, stateLog.Size, stateLog.ChunkCount)
	if err != nil {
		return nil, fmt.Errorf("download the log %q: %w", stateLog.Name, err)
	}

	return &domain.JoinedLog{FileID: stateLog.FileID, Name: stateLog.Name, Content: string(content), View: stateLog.View}, nil
}

// appendedFiles is the files a state lists after the ones already followed. Sources are only ever
// appended, so a state that does not start with the files already held was not written by the owner
// this tab follows.
func appendedFiles(held []keptFile, listed []domain.StateFile) ([]domain.StateFile, error) {
	if len(listed) < len(held) {
		return nil, fmt.Errorf("%w: the session lists fewer files than this tab holds", domain.ErrServiceFailed)
	}

	for index, file := range held {
		if listed[index].FileID != file.fileID {
			return nil, fmt.Errorf("%w: the session's file %d is not the one this tab holds", domain.ErrServiceFailed, index)
		}
	}

	return listed[len(held):], nil
}

func sourcesOf(kept []keptFile) []analysisDomain.SourceFile {
	files := make([]analysisDomain.SourceFile, 0, len(kept))
	for _, file := range kept {
		files = append(files, analysisDomain.SourceFile{Name: file.name, Path: file.path, Size: file.size})
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

func (sessions *followedSessions) takeByAnalysis(analysisID string) (followedSession, bool) {
	sessions.mutex.Lock()
	defer sessions.mutex.Unlock()

	for sessionID, followed := range sessions.bySession {
		if followed.analysisID == analysisID {
			delete(sessions.bySession, sessionID)

			return followed, true
		}
	}

	return followedSession{}, false
}
