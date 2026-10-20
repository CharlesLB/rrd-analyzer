import * as R from 'remeda';
import type { PendingSource } from '../analysis/analysis.model';

const SOURCE_FILE_PATTERN = /\.(rrd|xml)$/i;
const FILE_EXTENSION_PATTERN = /\.[^.]+$/;
const NO_PATH_IN_A_BROWSER = '';

export const isSupportedSource = (fileName: string): boolean => SOURCE_FILE_PATTERN.test(fileName);

export const stripSourceExtension = (fileName: string): string => fileName.replace(FILE_EXTENSION_PATTERN, '');

export const pendingSourcesOf = (files: readonly File[]): readonly PendingSource[] =>
  R.map(files, (file) => ({ name: file.name, path: NO_PATH_IN_A_BROWSER, size: file.size }));
