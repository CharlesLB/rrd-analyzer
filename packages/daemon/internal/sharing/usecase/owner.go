package usecase

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"slices"

	analysisDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/analysis/domain"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/sharing/domain"
)

// Start shares an analysis live and answers with its link. An analysis already live is published
// again rather than given a second session: the link a person already sent keeps working. A session
// the service has ended since is forgotten, and a new one started in its place.
//
// A first publication that fails ends the session it created: a link that was never handed out is
// worth nothing, and a session left behind would mark the analysis online with nothing to show.
func (service *Service) Start(callerContext context.Context, analysisID string, publication domain.Publication) (domain.Status, error) {
	if err := service.ready(); err != nil {
		return domain.Status{}, err
	}

	defer service.owned.lock(analysisID)()

	session, err := service.registry.Get(callerContext, analysisID)
	if err == nil {
		status, err := service.publish(callerContext, session, publication)
		if !errors.Is(err, domain.ErrSessionEnded) {
			return status, err
		}
	} else if !errors.Is(err, domain.ErrNotLive) {
		return domain.Status{}, fmt.Errorf("look for the live session of %q: %w", analysisID, err)
	}

	return service.startAnew(callerContext, analysisID, publication)
}

func (service *Service) startAnew(callerContext context.Context, analysisID string, publication domain.Publication) (domain.Status, error) {
	if _, err := service.library.Analysis(callerContext, analysisID); err != nil {
		return domain.Status{}, err
	}

	created, err := service.host.Create(callerContext)
	if err != nil {
		return domain.Status{}, fmt.Errorf("start a live session: %w", err)
	}

	session := domain.OwnedSession{
		AnalysisID: analysisID,
		SessionID:  created.Credentials.SessionID,
		OwnerToken: created.Credentials.OwnerToken,
		Key:        service.newKey(),
		ExpiresAt:  created.ExpiresAt,
	}

	if err := service.registry.Save(callerContext, session); err != nil {
		return domain.Status{}, fmt.Errorf("remember the live session: %w", err)
	}

	status, err := service.publish(callerContext, session, publication)
	if err != nil {
		return domain.Status{}, errors.Join(err, service.discard(callerContext, session))
	}

	return status, nil
}

// Publish sends what changed in a live analysis since it was last published: the sources not yet
// online, the log when it is a new one, and a new state. Every viewer is told by the service.
func (service *Service) Publish(callerContext context.Context, analysisID string, publication domain.Publication) (domain.Status, error) {
	if err := service.ready(); err != nil {
		return domain.Status{}, err
	}

	defer service.owned.lock(analysisID)()

	session, err := service.registry.Get(callerContext, analysisID)
	if err != nil {
		return domain.Status{}, fmt.Errorf("find the live session of %q: %w", analysisID, err)
	}

	return service.publish(callerContext, session, publication)
}

// publish forgets a session the service says has ended, whichever step found out.
func (service *Service) publish(callerContext context.Context, session domain.OwnedSession, publication domain.Publication) (domain.Status, error) {
	status, err := service.publishOnto(callerContext, session, publication)
	if errors.Is(err, domain.ErrSessionEnded) {
		return domain.Status{}, errors.Join(err, service.forget(callerContext, session.AnalysisID))
	}

	return status, err
}

func (service *Service) publishOnto(callerContext context.Context, session domain.OwnedSession, publication domain.Publication) (domain.Status, error) {
	analysis, err := service.library.Analysis(callerContext, session.AnalysisID)
	if err != nil {
		return domain.Status{}, err
	}

	sealing, err := newSealer(session.Key, service.entropy)
	if err != nil {
		return domain.Status{}, err
	}

	run := &ownerRun{service: service, session: session, sealing: sealing}
	if err := run.uploadSources(callerContext, analysis.Files); err != nil {
		return domain.Status{}, err
	}

	stateLog, err := run.uploadLog(callerContext, publication.Log)
	if err != nil {
		return domain.Status{}, err
	}

	if err := run.putState(callerContext, analysis, stateLog); err != nil {
		return domain.Status{}, err
	}

	return service.statusOf(run.session, analysis), nil
}

// Status is where a live analysis stands now. Someone opening the link moves its end, so the
// service is asked rather than the registry.
func (service *Service) Status(callerContext context.Context, analysisID string) (domain.Status, error) {
	if err := service.ready(); err != nil {
		return domain.Status{}, err
	}

	session, err := service.registry.Get(callerContext, analysisID)
	if err != nil {
		return domain.Status{}, fmt.Errorf("find the live session of %q: %w", analysisID, err)
	}

	return service.currentStatusOf(callerContext, session)
}

// List is every live session this app owns, as the library marks its analyses. A session the
// service no longer holds, and one whose analysis was deleted, is forgotten on the way.
func (service *Service) List(callerContext context.Context) ([]domain.Status, error) {
	if err := service.ready(); err != nil {
		return nil, err
	}

	sessions, err := service.registry.List(callerContext)
	if err != nil {
		return nil, fmt.Errorf("list the live sessions: %w", err)
	}

	statuses := make([]domain.Status, 0, len(sessions))
	for _, session := range sessions {
		status, err := service.currentStatusOf(callerContext, session)
		if errors.Is(err, domain.ErrSessionEnded) || errors.Is(err, analysisDomain.ErrAnalysisNotFound) {
			continue
		}

		if err != nil {
			return nil, err
		}

		statuses = append(statuses, status)
	}

	return statuses, nil
}

// currentStatusOf asks the service where a session stands and records it. A session whose analysis
// is gone is ended at the service too, since nobody can publish it again.
func (service *Service) currentStatusOf(callerContext context.Context, session domain.OwnedSession) (domain.Status, error) {
	analysis, err := service.library.Analysis(callerContext, session.AnalysisID)
	if errors.Is(err, analysisDomain.ErrAnalysisNotFound) {
		return domain.Status{}, errors.Join(err, service.discard(callerContext, session))
	}

	if err != nil {
		return domain.Status{}, err
	}

	revision, err := service.host.Status(callerContext, session.SessionID)
	if errors.Is(err, domain.ErrSessionEnded) {
		return domain.Status{}, errors.Join(err, service.forget(callerContext, session.AnalysisID))
	}

	if err != nil {
		return domain.Status{}, fmt.Errorf("ask after the live session of %q: %w", analysis.Name, err)
	}

	if err := service.registry.Renew(callerContext, session.AnalysisID, revision); err != nil {
		return domain.Status{}, fmt.Errorf("record where the live session of %q stands: %w", analysis.Name, err)
	}

	session.Revision, session.ExpiresAt = revision.Number, revision.ExpiresAt

	return service.statusOf(session, analysis), nil
}

// End ends a live session at once: the service erases it and tells its viewers, and the analysis is
// local again. A session the service had already ended is simply forgotten.
func (service *Service) End(callerContext context.Context, analysisID string) error {
	if err := service.ready(); err != nil {
		return err
	}

	defer service.owned.lock(analysisID)()

	session, err := service.registry.Get(callerContext, analysisID)
	if err != nil {
		return fmt.Errorf("find the live session of %q: %w", analysisID, err)
	}

	if err := service.host.End(callerContext, credentialsOf(session)); err != nil && !errors.Is(err, domain.ErrSessionEnded) {
		return fmt.Errorf("end the live session of %q: %w", analysisID, err)
	}

	return service.forget(callerContext, analysisID)
}

// Release lets go of everything live about an analysis that is about to be deleted: a session it
// owns is ended, as far as the service can be reached, and a session it follows lets go of its
// files. It works in a build with no share service too, which can still hold a session an earlier
// build started.
func (service *Service) Release(callerContext context.Context, analysisID string) error {
	if followed, isFollowed := service.followed.takeByAnalysis(analysisID); isFollowed {
		service.forgetKept(followed.files)
	}

	defer service.owned.lock(analysisID)()

	session, err := service.registry.Get(callerContext, analysisID)
	if errors.Is(err, domain.ErrNotLive) {
		return nil
	}

	if err != nil {
		return fmt.Errorf("find the live session of %q: %w", analysisID, err)
	}

	return service.discard(callerContext, session)
}

// discard ends a session as far as the service can be reached, and forgets it whatever the service
// said: it is called once the session is of no more use, and only forgetting it is this app's.
func (service *Service) discard(callerContext context.Context, session domain.OwnedSession) error {
	if service.host != nil {
		_ = service.host.End(callerContext, credentialsOf(session))
	}

	return service.forget(callerContext, session.AnalysisID)
}

func (service *Service) forget(callerContext context.Context, analysisID string) error {
	if err := service.registry.Forget(callerContext, analysisID); err != nil {
		return fmt.Errorf("forget the live session of %q: %w", analysisID, err)
	}

	return nil
}

func (service *Service) statusOf(session domain.OwnedSession, analysis analysisDomain.Analysis) domain.Status {
	files := make([]domain.FileStatus, 0, len(analysis.Files))
	for _, file := range analysis.Files {
		files = append(files, domain.FileStatus{Name: file.Name, Path: file.Path, Online: isOnline(session, file)})
	}

	var log *domain.LogStatus
	if session.Log != nil {
		log = &domain.LogStatus{Name: session.Log.Name, Online: true}
	}

	return domain.Status{
		AnalysisID:            session.AnalysisID,
		SessionID:             session.SessionID,
		Link:                  service.linkOf(session.SessionID, session.Key),
		Revision:              session.Revision,
		ExpiresAtMilliseconds: session.ExpiresAt.UnixMilli(),
		Files:                 files,
		Log:                   log,
	}
}

func isOnline(session domain.OwnedSession, file analysisDomain.SourceFile) bool {
	return slices.ContainsFunc(session.Files, func(online domain.OnlineFile) bool { return online.Identity == file.Identity() })
}

func credentialsOf(session domain.OwnedSession) domain.Credentials {
	return domain.Credentials{SessionID: session.SessionID, OwnerToken: session.OwnerToken}
}

// ownerRun is one publication: the session it brings up to date, recorded in the registry after
// every file it uploads so a publication that fails halfway leaves the files it did send online.
type ownerRun struct {
	service *Service
	session domain.OwnedSession
	sealing sealer
}

// uploadedBlob is a file as the service now holds it.
type uploadedBlob struct {
	fileID     string
	chunkCount int
}

func (run *ownerRun) uploadSources(callerContext context.Context, files []analysisDomain.SourceFile) error {
	for _, file := range files {
		if isOnline(run.session, file) {
			continue
		}

		content, err := run.service.readSource(callerContext, file)
		if err != nil {
			return err
		}

		uploaded, err := run.upload(callerContext, content)
		if err != nil {
			return fmt.Errorf("publish %q: %w", file.Name, err)
		}

		run.session.Files = append(run.session.Files, domain.OnlineFile{
			Identity:   file.Identity(),
			FileID:     uploaded.fileID,
			Name:       file.Name,
			Size:       int64(len(content)),
			ChunkCount: uploaded.chunkCount,
		})

		if err := run.service.registry.Save(callerContext, run.session); err != nil {
			return fmt.Errorf("record %q online: %w", file.Name, err)
		}
	}

	return nil
}

// readSource reads a source to publish, and refuses anything that is not one.
func (service *Service) readSource(callerContext context.Context, file analysisDomain.SourceFile) ([]byte, error) {
	if file.Path == "" {
		return nil, fmt.Errorf("%q: %w", file.Name, domain.ErrSourceUnlocated)
	}

	content, err := service.reader.Read(callerContext, file.Path)
	if err != nil {
		return nil, fmt.Errorf("%q: %w: %w", file.Name, domain.ErrSourceUnreadable, err)
	}

	if !service.format.Recognises(content) {
		return nil, fmt.Errorf("%q: %w", file.Name, domain.ErrNotASource)
	}

	return content, nil
}

func (run *ownerRun) upload(callerContext context.Context, content []byte) (uploadedBlob, error) {
	fileID := run.service.newIdentifier()
	chunkCount := chunkCountOf(len(content))

	for index := range chunkCount {
		sealed := run.sealing.seal(chunkAdditionalData(run.session.SessionID, fileID, index), chunkAt(content, index))
		if err := run.service.host.PutChunk(callerContext, credentialsOf(run.session), fileID, index, sealed); err != nil {
			return uploadedBlob{}, err
		}
	}

	return uploadedBlob{fileID: fileID, chunkCount: chunkCount}, nil
}

// uploadLog brings the session's log in line with the publication's, and answers with what the
// state says of it: nothing for an analysis with no log open.
func (run *ownerRun) uploadLog(callerContext context.Context, published *domain.PublishedLog) (*domain.StateLog, error) {
	if published == nil {
		run.session.Log = nil

		return nil, nil
	}

	view, err := normalisedView(published.View)
	if err != nil {
		return nil, err
	}

	if published.Content != nil {
		if err := run.holdLog(callerContext, published.Name, *published.Content); err != nil {
			return nil, err
		}
	} else if run.session.Log == nil || run.session.Log.Name != published.Name {
		return nil, domain.ErrLogContentMissing
	}

	online := run.session.Log

	return &domain.StateLog{FileID: online.FileID, Name: online.Name, Size: online.Size, ChunkCount: online.ChunkCount, View: view}, nil
}

// holdLog uploads a log unless the session already holds one of the same name and content.
func (run *ownerRun) holdLog(callerContext context.Context, name string, content string) error {
	sum := sha256.Sum256([]byte(content))
	digest := hex.EncodeToString(sum[:])

	if run.session.Log != nil && run.session.Log.Name == name && run.session.Log.Digest == digest {
		return nil
	}

	uploaded, err := run.upload(callerContext, []byte(content))
	if err != nil {
		return fmt.Errorf("publish the log %q: %w", name, err)
	}

	run.session.Log = &domain.OnlineLog{FileID: uploaded.fileID, Name: name, Size: int64(len(content)), ChunkCount: uploaded.chunkCount, Digest: digest}

	if err := run.service.registry.Save(callerContext, run.session); err != nil {
		return fmt.Errorf("record the log %q online: %w", name, err)
	}

	return nil
}

// normalisedView is the view a state carries: none for an empty one, and the JSON as it was for
// anything that parses. A view that does not parse is refused here, which is what leaves nothing in
// a state that encoding/json could fail on.
func normalisedView(view json.RawMessage) (json.RawMessage, error) {
	if len(view) == 0 {
		return nil, nil
	}

	if !json.Valid(view) {
		return nil, domain.ErrLogViewInvalid
	}

	return view, nil
}

// putState publishes the state. Every source is online by now, so each is found among the session's
// files.
//
// json.Marshal cannot fail on a State: the view is checked by normalisedView, and every other field
// is a string, a number, or a slice or struct of them.
func (run *ownerRun) putState(callerContext context.Context, analysis analysisDomain.Analysis, stateLog *domain.StateLog) error {
	plaintext, _ := json.Marshal(domain.State{
		Format:                  domain.StateFormat,
		Name:                    analysis.Name,
		Files:                   stateFilesOf(run.session, analysis.Files),
		Canvas:                  analysis.Canvas,
		LibraryOrder:            analysis.LibraryOrder,
		SeriesColors:            analysis.SeriesColors,
		Log:                     stateLog,
		PublishedAtMilliseconds: run.service.clock.Now().UnixMilli(),
	})

	sealed := run.sealing.seal(stateAdditionalData(run.session.SessionID), plaintext)

	revision, err := run.service.host.PutState(callerContext, credentialsOf(run.session), sealed)
	if err != nil {
		return fmt.Errorf("publish the state of %q: %w", analysis.Name, err)
	}

	run.session.Revision, run.session.ExpiresAt = revision.Number, revision.ExpiresAt

	if err := run.service.registry.Save(callerContext, run.session); err != nil {
		return fmt.Errorf("record the state of %q published: %w", analysis.Name, err)
	}

	return nil
}

func stateFilesOf(session domain.OwnedSession, files []analysisDomain.SourceFile) []domain.StateFile {
	byIdentity := make(map[string]domain.OnlineFile, len(session.Files))
	for _, online := range session.Files {
		byIdentity[online.Identity] = online
	}

	stateFiles := make([]domain.StateFile, 0, len(files))
	for _, file := range files {
		online := byIdentity[file.Identity()]
		stateFiles = append(stateFiles, domain.StateFile{FileID: online.FileID, Name: online.Name, Size: online.Size, ChunkCount: online.ChunkCount})
	}

	return stateFiles
}
