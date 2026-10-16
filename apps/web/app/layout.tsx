// The <html> element is rendered by app/[locale]/layout.tsx so it can carry the active lang.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
