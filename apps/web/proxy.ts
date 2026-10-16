import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

// Redirects locale-less URLs to /en or /tr based on the cookie or Accept-Language header.
export default createMiddleware(routing);

export const config = {
  // Skip API routes, Next internals and files with an extension (images, manifest, etc.).
  matcher: '/((?!api|_next|_vercel|.*\\..*).*)',
};
