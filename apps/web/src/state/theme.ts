import { create } from 'zustand';
import { Theme } from '@folio/shared';
function initialTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  const query = Theme.safeParse(new URLSearchParams(window.location.search).get('theme'));
  if (query.success) return query.data;
  try {
    const stored = Theme.safeParse(localStorage.getItem('folio-theme'));
    if (stored.success) return stored.data;
  } catch {
    /* Storage may be unavailable. */
  }
  return 'dark';
}
export const useTheme = create<{ theme: Theme; setTheme(theme: Theme): void }>((set) => ({
  theme: initialTheme(),
  setTheme(theme) {
    const validated = Theme.parse(theme);
    set({ theme: validated });
    try {
      localStorage.setItem('folio-theme', validated);
    } catch {
      /* In-memory theme still works. */
    }
  },
}));
