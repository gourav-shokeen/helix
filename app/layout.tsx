// app/layout.tsx
import type { Metadata } from 'next'
import { ThemeProvider } from '@/components/ui/ThemeProvider'
import '@/styles/globals.css'

export const metadata: Metadata = {
  title: 'Helix — Plan. Code. Collaborate.',
  description: 'Real-time collaborative notes for developers',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}
