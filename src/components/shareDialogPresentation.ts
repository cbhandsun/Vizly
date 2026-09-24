export type ShareExpirationOption = 'never' | '1day' | '7days' | '30days';

export interface ShareCloudDiagramScope {
  sourceDiagramId: string;
  cloudDiagramId: string;
}

export function resolveShareDiagramId(
  diagramId: string,
  scope: ShareCloudDiagramScope | null,
): string {
  return scope?.sourceDiagramId === diagramId ? scope.cloudDiagramId : diagramId;
}

export function getShareExpiresAt(option: ShareExpirationOption, now = new Date()): Date | null {
  const dayMs = 24 * 60 * 60 * 1000;
  switch (option) {
    case '1day': return new Date(now.getTime() + dayMs);
    case '7days': return new Date(now.getTime() + 7 * dayMs);
    case '30days': return new Date(now.getTime() + 30 * dayMs);
    default: return null;
  }
}

export function formatShareRelativeTime(dateString: string, locale: string): string {
  const timestamp = Date.parse(dateString);
  if (!Number.isFinite(timestamp)) return '';

  const minutes = Math.floor(Math.max(0, Date.now() - timestamp) / 60000);
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  if (minutes < 1) return formatter.format(0, 'minute');
  if (minutes < 60) return formatter.format(-minutes, 'minute');
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return formatter.format(-hours, 'hour');
  const days = Math.floor(hours / 24);
  if (days < 30) return formatter.format(-days, 'day');
  return new Intl.DateTimeFormat(locale).format(new Date(timestamp));
}

export const isCloudDiagramId = (id: string): boolean => (
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
);
