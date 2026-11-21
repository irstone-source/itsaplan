import { useEffect } from 'react';

// A printed docket is always light: the dark theme is lifted for the print and put back after.
export function useLightPrint() {
  useEffect(() => {
    const root = document.documentElement;
    let wasDark = false;
    const before = () => {
      wasDark = root.classList.contains('dark');
      root.classList.remove('dark');
    };
    const after = () => {
      if (wasDark) root.classList.add('dark');
    };
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    return () => {
      window.removeEventListener('beforeprint', before);
      window.removeEventListener('afterprint', after);
    };
  }, []);
}
