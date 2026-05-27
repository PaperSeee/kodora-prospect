import { Pipeline } from "@/components/Pipeline"

export const metadata = { title: "Pipeline — Kodora Prospect" }

export default function PipelinePage() {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="border-b border-zinc-800 px-6 py-3">
        <h1 className="text-lg font-bold text-white">Pipeline CRM</h1>
      </div>
      <Pipeline />
    </div>
  )
}
