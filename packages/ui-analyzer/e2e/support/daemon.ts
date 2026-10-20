const DAEMON_HOST = '127.0.0.1';
const FIRST_DAEMON_PORT = 34115;
const FIRST_PARALLEL_INDEX = 0;

const parallelIndex = Number(process.env['TEST_PARALLEL_INDEX'] ?? FIRST_PARALLEL_INDEX);

export const daemonPortOf = (workerParallelIndex: number): number => FIRST_DAEMON_PORT + workerParallelIndex;

export const APP_DAEMON_URL = `http://${DAEMON_HOST}:${daemonPortOf(FIRST_PARALLEL_INDEX)}`;

export const DAEMON_URL = `http://${DAEMON_HOST}:${daemonPortOf(parallelIndex)}`;

export const isOnSharedDaemon = DAEMON_URL === APP_DAEMON_URL;

export const WORKER_SUFFIX = `-${parallelIndex}`;

export const daemonAddressed = (appUrl: string): string => `${DAEMON_URL}${appUrl.slice(APP_DAEMON_URL.length)}`;
