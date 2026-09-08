import { Sourcer } from "@/components/Sourcer"

export const metadata = { title: "Sourcer — Kodora Prospect" }

export default function SourcerPage() {
  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 p-6">
      <div className="mb-6">
        <h1 className="text-lg font-bold text-gray-900">Sourcer des prospects</h1>
        <p className="text-sm text-gray-500">
          Recherche automatique via Google Places, avec diagnostic et scoring instantanés.
        </p>
      </div>
      <Sourcer />
    </div>
  )
}
