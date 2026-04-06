// app/layout.tsx
import type { Metadata, Viewport } from 'next'
import { ThemeProvider } from '@/components/ui/ThemeProvider'
import { Providers } from '@/components/Providers'
import '@/styles/globals.css'

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

export const metadata: Metadata = {
  title: 'Helix — Plan. Code. Collaborate.',
  description: 'Real-time collaborative notes for developers',
  icons: {
    icon: '/favicon.ico',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ThemeProvider>
          <Providers>{children}</Providers>
        </ThemeProvider>
      </body>
    </html>
  )
}
