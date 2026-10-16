// Fallback for requests that never reach a locale segment (the proxy normally redirects first).
export default function GlobalNotFound() {
  return (
    <html lang="en">
      <body>
        <main
          style={{ fontFamily: 'system-ui, sans-serif', padding: '20vh 16px', textAlign: 'center' }}
        >
          <h1>Page not found</h1>
          <a href="/">Ayvago</a>
        </main>
      </body>
    </html>
  );
}
