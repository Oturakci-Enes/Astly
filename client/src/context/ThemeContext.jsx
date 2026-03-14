import { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext();

const THEMES = [
  { id: 'dark',  labelKey: 'theme_dark',  desc: 'theme_dark_desc'  },
  { id: 'light', labelKey: 'theme_light', desc: 'theme_light_desc' },
];

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    return localStorage.getItem('workos-theme') || 'light';
  });

  const setTheme = (t) => {
    setThemeState(t);
    localStorage.setItem('workos-theme', t);
  };

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, themes: THEMES }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be inside ThemeProvider');
  return ctx;
}
