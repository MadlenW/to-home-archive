import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title:       'To Home Archive',
  description: 'A spatial archive of domestic memory',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Martian+Mono:wght@300;400&family=EB+Garamond:ital,wght@0,400;1,400&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {children}
      </body>
    </html>
  )
}
