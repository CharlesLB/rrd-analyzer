import { Service } from '@angular/core';
import type { JoinedSessionDto, PublishedLogDto, SessionPublicationDto, SessionStatusDto } from '../../../../core/gateway/analyzer.dto';
import { useAnalyzerGateway } from '../../../../core/gateway/use-analyzer-gateway/use-analyzer-gateway';
import { readLogView, writtenLogView } from '../../../logs/models/log-view/log-view';
import type { FollowedSession } from '../../models/followed-session/followed-session';
import type { LiveSession, LogPublication, SessionPublication } from '../../models/live-session/live-session';

const toLiveSession = (dto: SessionStatusDto): LiveSession => ({
  analysisId: dto.analysisId,
  sessionId: dto.sessionId,
  link: dto.link,
  revision: dto.revision,
  expiresAtMilliseconds: dto.expiresAtMilliseconds,
  files: dto.files.map((file) => ({ name: file.name, path: file.path, isOnline: file.online })),
  log: dto.log === null ? null : { name: dto.log.name, isOnline: dto.log.online },
});

const toFollowedSession = (dto: JoinedSessionDto): FollowedSession => ({
  sessionId: dto.sessionId,
  analysisId: dto.analysisId,
  revision: dto.revision,
  expiresAtMilliseconds: dto.expiresAtMilliseconds,
  liveUrl: dto.liveUrl,
  hasChanged: dto.changed,
  log:
    dto.log === null
      ? null
      : {
          fileId: dto.log.fileId,
          file: new File([dto.log.content], dto.log.name),
          view: readLogView(dto.log.view),
          viewSignature: JSON.stringify(dto.log.view),
        },
});

const toPublishedLog = async (log: LogPublication): Promise<PublishedLogDto> => {
  const published = { name: log.file.name, view: writtenLogView(log.view) };

  return log.sendsContent ? { ...published, content: await log.file.text() } : published;
};

const toPublicationDto = async (publication: SessionPublication): Promise<SessionPublicationDto> => ({
  log: publication.log === null ? null : await toPublishedLog(publication.log),
});

@Service()
export class SharingRepository {
  private readonly _withGateway = useAnalyzerGateway();

  public async sessions(): Promise<readonly LiveSession[]> {
    return (await this._withGateway(async (gateway) => await gateway.listSessions())).map(toLiveSession);
  }

  public async start(analysisId: string, publication: SessionPublication): Promise<LiveSession> {
    const published = await toPublicationDto(publication);

    return toLiveSession(await this._withGateway(async (gateway) => await gateway.startSession(analysisId, published)));
  }

  public async publish(analysisId: string, publication: SessionPublication): Promise<LiveSession> {
    const published = await toPublicationDto(publication);

    return toLiveSession(await this._withGateway(async (gateway) => await gateway.publishSession(analysisId, published)));
  }

  public async end(analysisId: string): Promise<void> {
    await this._withGateway(async (gateway) => await gateway.endSession(analysisId));
  }

  public async join(sessionId: string, key: string): Promise<FollowedSession> {
    return toFollowedSession(await this._withGateway(async (gateway) => await gateway.joinSession(sessionId, key)));
  }

  public async refresh(sessionId: string): Promise<FollowedSession> {
    return toFollowedSession(await this._withGateway(async (gateway) => await gateway.refreshSession(sessionId)));
  }

  public async forget(sessionId: string): Promise<void> {
    await this._withGateway(async (gateway) => await gateway.forgetSession(sessionId));
  }
}
