import { Sourcer } from "@/components/Sourcer"

export const metadata = { title: "Sourcer — Kodora Prospect" }

export default function SourcerPage() {
  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mb-6">
        <h1 className="text-lg font-bold text-white">Sourcer des prospects</h1>
        <p className="text-sm text-zinc-400">
          Recherche automatique via Google Places, avec diagnostic et scoring instantanés.
        </p>
      </div>
      <Sourcer />
    </div>
  )
}
