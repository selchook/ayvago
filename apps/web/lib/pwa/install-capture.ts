// Inline <head> script: keeps a beforeinstallprompt that fires before hydration on window, where
// the install store (install-store.ts) picks it up.
export const INSTALL_CAPTURE_SCRIPT = `window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__ayvagoInstallEvent=e;});`;
