import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "Kodora Prospect",
  description: "Outil de prospection pour Kodora",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className="h-full antialiased">
      <body className="flex h-full flex-col bg-zinc-950 text-zinc-100">
        <nav className="flex items-center gap-6 border-b border-zinc-800 px-6 py-3">
          <span className="text-sm font-bold tracking-tight text-white">
            Kodora <span className="text-indigo-400">Prospect</span>
          </span>
          <a href="/dashboard" className="text-sm text-zinc-400 hover:text-white transition-colors">
            Dashboard
          </a>
          <a href="/pipeline" className="text-sm text-zinc-400 hover:text-white transition-colors">
            Pipeline
          </a>
          <a href="/sourcer" className="text-sm text-zinc-400 hover:text-white transition-colors">
            Sourcer
          </a>
        </nav>
        <main className="flex flex-1 flex-col overflow-hidden">{children}</main>
      </body>
    </html>
  )
}
