import type { Metadata } from "next"
import Link from "next/link"
import "./globals.css"

export const metadata: Metadata = {
  title: "Kodora Prospect",
  description: "Outil de prospection pour Kodora",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className="h-full antialiased">
      <body className="flex h-full flex-col bg-gray-50 text-gray-900">
        <nav className="flex items-center gap-6 border-b border-gray-200 bg-white px-6 py-3">
          <span className="text-sm font-bold tracking-tight text-gray-900">
            Kodora <span className="text-indigo-600">Prospect</span>
          </span>
          <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
            Dashboard
          </Link>
          <Link href="/whatsapp" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
            WhatsApp
          </Link>
          <Link href="/reponses" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
            Réponses
          </Link>
          <Link href="/pipeline" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
            Pipeline
          </Link>
          <Link href="/sourcer" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
            Sourcer
          </Link>
        </nav>
        <main className="flex flex-1 flex-col overflow-hidden">{children}</main>
      </body>
    </html>
  )
}
