import { store } from '../state/store.js';
import { BASE_PATH, buildWorkspaceSlugId } from './router.js';

export function updateWorkspaceSlugUrl(id: string, slug: string | null): void {
  if (!slug) return;

  const routeParams = (store.get('routeParams') || {}) as Record<string, string>;
  const currentSlugId = routeParams.slugId || '';
  const expectedSlugId = buildWorkspaceSlugId(slug, id);

  if (currentSlugId === expectedSlugId) return;

  const newPath = `${BASE_PATH}/workspace/${encodeURIComponent(expectedSlugId)}`;
  history.replaceState(null, '', newPath);

  store.set('routeParams', { ...routeParams, slugId: expectedSlugId } as unknown);
}
