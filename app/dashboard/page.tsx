import { Dashboard } from "@/components/Dashboard"

export default function DashboardPage() {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <h1 className="text-lg font-bold text-gray-900">Dashboard</h1>
        <p className="text-xs text-gray-500 mt-0.5">Vue d'ensemble en temps réel</p>
      </div>
      <div className="flex-1 overflow-hidden">
        <Dashboard />
      </div>
    </div>
  )
}
