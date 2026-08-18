"use client";

import { useEffect, useState, useRef } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";

interface WidgetConfig {
  brand_name: string;
  brand_color: string;
  welcome_message: string;
  logo_url: string | null;
  position: string;
}

interface Message {
  id: string;
  sender: "user" | "bot";
  text: string;
  time: string;
}

export function ChatWidget() {
  const searchParams = useSearchParams();
  const widgetKey = searchParams.get("key") || searchParams.get("public_widget_key");

  const [config, setConfig] = useState<WidgetConfig | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(widgetKey));
  const [error, setError] = useState<string | null>(
    widgetKey ? null : "No public widget key provided in the URL query (?key=pk_live_...).",
  );
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!widgetKey) return;

    let isMounted = true;

    async function fetchConfig() {
      try {
        const res = await fetch(`/api/widget/config?key=${encodeURIComponent(widgetKey!)}`);
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || "Failed to load widget configuration.");
        }

        if (isMounted) {
          setConfig(data);
          setMessages([
            {
              id: "welcome-msg",
              sender: "bot",
              text: data.welcome_message || "Hi! How can we help you today?",
              time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            },
          ]);
          setIsLoading(false);
        }
      } catch (err: unknown) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : "Failed to load widget configuration.");
          setIsLoading(false);
        }
      }
    }

    fetchConfig();

    return () => {
      isMounted = false;
    };
  }, [widgetKey]);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim()) return;

    const userText = inputMessage.trim();
    const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      sender: "user",
      text: userText,
      time: now,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputMessage("");

    // Temporary placeholder response until Day 4 AI integration
    setTimeout(() => {
      const placeholderBotMsg: Message = {
        id: `bot-${Date.now()}`,
        sender: "bot",
        text: "Thanks for reaching out! Real-time AI support responses will be active in Day 4.",
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, placeholderBotMsg]);
    }, 600);
  };

  if (isLoading) {
    return (
      <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-400 border-t-zinc-900 dark:border-t-zinc-50"></div>
        <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
          Loading widget...
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed bottom-6 right-6 z-50 max-w-sm rounded-2xl border border-red-200 bg-red-50 p-4 shadow-lg dark:border-red-900/50 dark:bg-red-950/80">
        <div className="flex items-start gap-2.5">
          <svg
            className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <div>
            <h4 className="text-xs font-semibold text-red-800 dark:text-red-200">
              Widget Error
            </h4>
            <p className="mt-1 text-xs text-red-700 dark:text-red-300">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!config) return null;

  const isLeft = config.position === "bottom-left";
  const positionClasses = isLeft ? "bottom-6 left-6" : "bottom-6 right-6";
  const brandColor = config.brand_color || "#0F172A";

  return (
    <div className={`fixed ${positionClasses} z-50 font-sans`}>
      {/* Expanded Chat Panel */}
      {isOpen && (
        <div
          className={`mb-4 flex h-[520px] max-h-[calc(100vh-100px)] w-[360px] max-w-[calc(100vw-32px)] flex-col overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-2xl transition-all duration-200 dark:border-zinc-800 dark:bg-zinc-900 sm:w-[380px]`}
        >
          {/* Header */}
          <div
            style={{ backgroundColor: brandColor }}
            className="flex items-center justify-between px-4 py-3.5 text-white shadow-sm"
          >
            <div className="flex items-center gap-3">
              {config.logo_url ? (
                <div className="relative h-8 w-8 overflow-hidden rounded-full border border-white/20 bg-white">
                  <Image
                    src={config.logo_url}
                    alt={config.brand_name}
                    fill
                    className="object-cover"
                  />
                </div>
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-xs font-bold text-white uppercase">
                  {config.brand_name.charAt(0)}
                </div>
              )}
              <div>
                <h3 className="text-sm font-semibold leading-tight text-white">
                  {config.brand_name}
                </h3>
                <span className="flex items-center gap-1.5 text-[11px] text-white/80">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
                  Online
                </span>
              </div>
            </div>

            <button
              onClick={() => setIsOpen(false)}
              aria-label="Close chat"
              className="rounded-lg p-1.5 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Messages Stream */}
          <div className="flex-1 space-y-3.5 overflow-y-auto p-4 bg-zinc-50/50 dark:bg-zinc-950/30">
            {messages.map((msg) => {
              const isBot = msg.sender === "bot";
              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isBot ? "items-start" : "items-end"}`}
                >
                  <div
                    style={!isBot ? { backgroundColor: brandColor } : undefined}
                    className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 text-sm shadow-2xs ${
                      isBot
                        ? "rounded-tl-xs border border-zinc-200/60 bg-white text-zinc-800 dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-100"
                        : "rounded-tr-xs text-white"
                    }`}
                  >
                    <p className="whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                  </div>
                  <span className="mt-1 px-1 text-[10px] text-zinc-400 dark:text-zinc-500">
                    {msg.time}
                  </span>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Bar */}
          <form
            onSubmit={handleSendMessage}
            className="flex items-center gap-2 border-t border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900"
          >
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="Type a message..."
              className="flex-1 rounded-xl border border-zinc-300 bg-white px-3.5 py-2 text-sm text-zinc-900 placeholder:text-zinc-500 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder:text-zinc-400 dark:focus:border-zinc-400 dark:focus:ring-zinc-400"
            />
            <button
              type="submit"
              disabled={!inputMessage.trim()}
              style={{ backgroundColor: inputMessage.trim() ? brandColor : undefined }}
              aria-label="Send message"
              className={`flex h-9 w-9 items-center justify-center rounded-xl transition-all ${
                inputMessage.trim()
                  ? "text-white shadow-xs hover:opacity-90 active:scale-95"
                  : "bg-zinc-100 text-zinc-400 cursor-not-allowed dark:bg-zinc-800 dark:text-zinc-600"
              }`}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>
          </form>
        </div>
      )}

      {/* Launcher Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{ backgroundColor: brandColor }}
        aria-label={isOpen ? "Close support chat" : "Open support chat"}
        className="flex h-14 w-14 items-center justify-center rounded-full text-white shadow-xl transition-transform duration-200 hover:scale-105 active:scale-95 focus:outline-none focus:ring-4 focus:ring-zinc-400/30"
      >
        {isOpen ? (
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            />
          </svg>
        )}
      </button>
    </div>
  );
}
