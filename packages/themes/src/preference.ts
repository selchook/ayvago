import { THEME_IDS } from './tokens';

export const THEME_COOKIE = 'ayvago-theme';
export const MODE_COOKIE = 'ayvago-mode';
// One year; the preference is not sensitive.
export const PREFERENCE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Inline script for <head>: applies the saved theme and mode before first paint so statically
 * rendered pages never flash the default theme. Kept dependency-free and tiny on purpose.
 */
export const themeBootstrapScript = `(function(){try{var d=document.documentElement,c=document.cookie,t=(c.match(/(?:^|; )${THEME_COOKIE}=([a-z]+)/)||[])[1],m=(c.match(/(?:^|; )${MODE_COOKIE}=([a-z]+)/)||[])[1];if(${JSON.stringify(
  THEME_IDS,
)}.indexOf(t)>=0)d.setAttribute('data-theme',t);if(m==='light'||m==='dark')d.setAttribute('data-mode',m);}catch(e){}})();`;
