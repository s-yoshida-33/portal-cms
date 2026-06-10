import { useEffect } from 'react';

export function usePageTitle(title: string) {
  useEffect(() => {
    document.title = `${title} | Portal CMS`;
    return () => { document.title = 'Portal CMS'; };
  }, [title]);
}
