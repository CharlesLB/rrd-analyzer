import type { ServiceEnvironment } from './config/service-environment';
import { serveSessionApi } from './session-api/session-api';

export { LiveSession } from './live-session/live-session';

export default { fetch: serveSessionApi } satisfies ExportedHandler<ServiceEnvironment>;
