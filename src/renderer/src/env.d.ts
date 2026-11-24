import type { SnapleafApi } from '@shared/types';

declare global {
  interface Window {
    snapleaf: SnapleafApi;
  }
}

export {};
