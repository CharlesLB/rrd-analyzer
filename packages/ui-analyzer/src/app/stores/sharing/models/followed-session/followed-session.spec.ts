import { describe, expect, it } from 'vitest';
import type { LogView } from '../../../logs/models/log-view/log-view';
import { type FollowedLog, LOG_HANDOVERS, logHandoverBetween } from './followed-session';

const SHOWN_VIEW: LogView = { mapping: null, chosenColors: new Map(), hiddenTypes: new Set(), isShown: true };

const logOf = (fileId: string, viewSignature = '{"isShown":true}'): FollowedLog => ({
  fileId,
  file: new File(['{}'], `${fileId}.ndjson`),
  view: SHOWN_VIEW,
  viewSignature,
});

describe('followed session', () => {
  it('logHandoverBetween, with no log shown and none arrived, hands nothing over', () => {
    expect(logHandoverBetween(null, null)).toBeNull();
  });

  it('logHandoverBetween, for a log the owner removed, hands over its removal', () => {
    expect(logHandoverBetween(logOf('f1'), null)).toEqual({ kind: LOG_HANDOVERS.REMOVED });
  });

  it('logHandoverBetween, for a first log, hands over its file and how it is shown', () => {
    const arrived = logOf('f1');

    expect(logHandoverBetween(null, arrived)).toEqual({ kind: LOG_HANDOVERS.OPENED, file: arrived.file, view: SHOWN_VIEW });
  });

  it('logHandoverBetween, for a log replaced by another file, hands over the new file', () => {
    const arrived = logOf('f2');

    expect(logHandoverBetween(logOf('f1'), arrived)).toEqual({ kind: LOG_HANDOVERS.OPENED, file: arrived.file, view: SHOWN_VIEW });
  });

  it('logHandoverBetween, for the same log shown another way, hands over only the new way to show it', () => {
    expect(logHandoverBetween(logOf('f1'), logOf('f1', '{"isShown":false}'))).toEqual({ kind: LOG_HANDOVERS.RESTYLED, view: SHOWN_VIEW });
  });

  it('logHandoverBetween, for the same log shown the same way, hands nothing over', () => {
    expect(logHandoverBetween(logOf('f1'), logOf('f1'))).toBeNull();
  });
});
