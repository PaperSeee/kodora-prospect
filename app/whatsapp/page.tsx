import { WhatsappBoard } from "@/components/WhatsappBoard"

export default function WhatsappPage() {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-zinc-800 px-6 py-4">
        <h1 className="text-lg font-bold text-white">WhatsApp</h1>
        <p className="text-xs text-zinc-500 mt-0.5">Contact direct des prospects — trié par score</p>
      </div>
      <div className="flex-1 overflow-hidden">
        <WhatsappBoard />
      </div>
    </div>
  )
}
