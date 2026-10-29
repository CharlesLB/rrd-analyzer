import { Service } from '@angular/core';
import type { JoinedLogDto, JoinedSessionDto, PublishedLogDto, SessionPublicationDto, SessionStatusDto } from '../../../../core/gateway/analyzer.dto';
import type { AnalyzerGateway } from '../../../../core/gateway/analyzer.gateway';
import { statusOfFailure } from '../../../../core/gateway/gateway-request-error/gateway-request-error';
import { useAnalyzerGateway } from '../../../../core/gateway/use-analyzer-gateway/use-analyzer-gateway';
import { readLogView, writtenLogView } from '../../../logs/models/log-view/log-view';
import type { FollowedLog, FollowedSession } from '../../models/followed-session/followed-session';
import type { LiveSession, LogPublication, SessionPublication } from '../../models/live-session/live-session';
import { ShareFailureError, shareFailureOf } from '../../models/share-failure/share-failure';

const toLiveSession = (dto: SessionStatusDto): LiveSession => ({
  analysisId: dto.analysisId,
  sessionId: dto.sessionId,
  link: dto.link,
  revision: dto.revision,
  expiresAtMilliseconds: dto.expiresAtMilliseconds,
  files: dto.files.map((file) => ({ name: file.name, path: file.path, isOnline: file.online })),
  log: dto.log === null ? null : { name: dto.log.name, isOnline: dto.log.online },
});

const toFollowedLog = (dto: JoinedLogDto, previous: FollowedLog | null): FollowedLog => {
  const viewSignature = JSON.stringify(dto.view);

  if (previous?.fileId !== dto.fileId) {
    return { fileId: dto.fileId, file: new File([dto.content ?? ''], dto.name), view: readLogView(dto.view), viewSignature };
  }

  return previous.viewSignature === viewSignature ? previous : { ...previous, view: readLogView(dto.view), viewSignature };
};

const toFollowedSession = (dto: JoinedSessionDto, previousLog: FollowedLog | null): FollowedSession => ({
  sessionId: dto.sessionId,
  analysisId: dto.analysisId,
  revision: dto.revision,
  expiresAtMilliseconds: dto.expiresAtMilliseconds,
  liveUrl: dto.liveUrl,
  log: dto.log === null ? null : toFollowedLog(dto.log, previousLog),
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
  private readonly _answeredLogs = new Map<string, FollowedLog | null>();

  public async sessions(): Promise<readonly LiveSession[]> {
    return (await this._request(async (gateway) => await gateway.listSessions())).map(toLiveSession);
  }

  public async start(analysisId: string, publication: SessionPublication): Promise<LiveSession> {
    const published = await toPublicationDto(publication);

    return toLiveSession(await this._request(async (gateway) => await gateway.startSession(analysisId, published)));
  }

  public async publish(analysisId: string, publication: SessionPublication): Promise<LiveSession> {
    const published = await toPublicationDto(publication);

    return toLiveSession(await this._request(async (gateway) => await gateway.publishSession(analysisId, published)));
  }

  public async end(analysisId: string): Promise<void> {
    await this._request(async (gateway) => await gateway.endSession(analysisId));
  }

  public async join(sessionId: string, key: string): Promise<FollowedSession> {
    return this._followedFrom(await this._request(async (gateway) => await gateway.joinSession(sessionId, key)));
  }

  public async refresh(sessionId: string): Promise<FollowedSession> {
    return this._followedFrom(await this._request(async (gateway) => await gateway.refreshSession(sessionId)));
  }

  public async forget(sessionId: string): Promise<void> {
    await this._request(async (gateway) => await gateway.forgetSession(sessionId));
    this._answeredLogs.delete(sessionId);
  }

  private async _request<TAnswer>(operation: (gateway: AnalyzerGateway) => Promise<TAnswer>): Promise<TAnswer> {
    try {
      return await this._withGateway(operation);
    } catch (error) {
      throw new ShareFailureError(shareFailureOf(statusOfFailure(error)), error);
    }
  }

  private _followedFrom(dto: JoinedSessionDto): FollowedSession {
    const followed = toFollowedSession(dto, this._answeredLogs.get(dto.sessionId) ?? null);

    this._answeredLogs.set(dto.sessionId, followed.log);

    return followed;
  }
}
