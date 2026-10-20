import { formatMessage } from '@rrd-analyzer/shared';
import type { Messages } from '../../../../stores/i18n/models/messages/messages.model';
import type { PrimaryDownload, ReleaseFile } from '../../../../stores/releases/models/release-catalogue/release-catalogue.model';
import { SECTION_ANCHORS } from '../page-sections/page-sections.model';

export type DownloadCall = {
  readonly label: string;
  readonly detail: string;
  readonly href: string;
};

const fileCallOf = (primary: PrimaryDownload, file: ReleaseFile, version: string, texts: Messages): DownloadCall => ({
  label: formatMessage(texts.downloadCall.downloadFor, { platform: texts.download.platforms[primary.platform].name }),
  detail: formatMessage(texts.downloadCall.fileDetail, {
    version,
    file: formatMessage(texts.downloadCall.fileType, { label: texts.download.files[file.kind], extension: file.extension }),
  }),
  href: file.url,
});

const unpackagedCallOf = (version: string, texts: Messages): DownloadCall => ({
  label: texts.downloadCall.getProduct,
  detail: formatMessage(texts.downloadCall.unpackagedDetail, { version }),
  href: SECTION_ANCHORS.DOWNLOAD,
});

export const downloadCallOf = (primary: PrimaryDownload, version: string, texts: Messages): DownloadCall =>
  primary.file === null ? unpackagedCallOf(version, texts) : fileCallOf(primary, primary.file, version, texts);
