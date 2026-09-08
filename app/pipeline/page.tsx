import { Pipeline } from "@/components/Pipeline"

export const metadata = { title: "Pipeline — Kodora Prospect" }

export default function PipelinePage() {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="border-b border-gray-200 bg-white px-6 py-3">
        <h1 className="text-lg font-bold text-gray-900">Pipeline CRM</h1>
      </div>
      <Pipeline />
    </div>
  )
}
