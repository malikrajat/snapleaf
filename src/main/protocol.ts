import { net, protocol } from 'electron';
import { existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { appPaths } from './paths';
import { log } from './logger';

export function registerPrivilegedSchemes(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'snapleaf',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true
      }
    }
  ]);
}

export function registerSnapleafProtocol(): void {
  protocol.handle('snapleaf', async (request) => {
    try {
      const url = new URL(request.url);
      const folder = url.hostname === 'upload' ? appPaths().uploads : url.hostname === 'capture' ? appPaths().captures : null;
      if (!folder) return new Response('Not found', { status: 404 });
      const name = basename(decodeURIComponent(url.pathname));
      const file = join(folder, name);
      if (!existsSync(file)) return new Response('Not found', { status: 404 });
      return net.fetch(pathToFileURL(file).toString());
    } catch (error) {
      log.warn('snapleaf:// request failed', { error: String(error) });
      return new Response('Not found', { status: 404 });
    }
  });
}
