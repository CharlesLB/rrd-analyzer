import type { ServiceEnvironment } from '../config/service-environment';

declare global {
  namespace Cloudflare {
    interface Env extends ServiceEnvironment {}
  }
}
