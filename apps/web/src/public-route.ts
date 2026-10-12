export function isPublicDemoRoute(pathname: string, search = ''): boolean {
  if (pathname === '/demo' || pathname === '/demo/') return true;
  const query = new URLSearchParams(search);
  return query.get('demo') === '1' || query.get('debug') === '1';
}
