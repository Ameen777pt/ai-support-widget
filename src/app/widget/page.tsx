import { Suspense } from "react";
import { ChatWidget } from "./chat-widget";

export default function WidgetPage() {
  return (
    <main className="min-h-screen bg-transparent">
      <Suspense
        fallback={
          <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-400 border-t-zinc-900 dark:border-t-zinc-50"></div>
            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
              Loading widget...
            </span>
          </div>
        }
      >
        <ChatWidget />
      </Suspense>
    </main>
  );
}
