"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";

interface WidgetConfig {
  brand_name: string;
  brand_color: string;
  welcome_message: string;
  logo_url: string | null;
  position: string;
  launcher_text?: string;
  suggested_questions?: string[];
}

interface Message {
  id: string;
  sender: "user" | "bot" | "agent";
  text: string;
  time: string;
}

interface ApiMessage {
  id: string;
  sender_type: "user" | "bot" | "agent";
  content: string;
  created_at: string;
}

const VISITOR_STORAGE_KEY = "ai_widget_visitor_id";
const VISITOR_ID_REGEX = /^vis_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const POLLING_INTERVAL_MS = 3500;

let fallbackMessageCounter = 0;
function generateFallbackMessageId(prefix: string): string {
  fallbackMessageCounter += 1;
  return `${prefix}-${Date.now()}-${fallbackMessageCounter}`;
}

function getOrCreateVisitorId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem(VISITOR_STORAGE_KEY);
  if (!id || !VISITOR_ID_REGEX.test(id)) {
    id = `vis_${crypto.randomUUID()}`;
    localStorage.setItem(VISITOR_STORAGE_KEY, id);
  }
  return id;
}

function getStoredConversationId(widgetKey: string): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(`ai_widget_conv_${widgetKey}`);
}

function setStoredConversationId(widgetKey: string, convId: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(`ai_widget_conv_${widgetKey}`, convId);
}

function formatTime(dateStr?: string): string {
  const d = dateStr ? new Date(dateStr) : new Date();
  if (isNaN(d.getTime())) return "";
  const rawHours = d.getUTCHours();
  const minutes = d.getUTCMinutes().toString().padStart(2, "0");
  const period = rawHours >= 12 ? "PM" : "AM";
  const hours = (rawHours % 12 || 12).toString().padStart(2, "0");
  return `${hours}:${minutes} ${period}`;
}

/**
 * Deterministically deduplicates messages by stable message ID while preserving insertion order.
 */
function deduplicateMessages(msgList: Message[]): Message[] {
  const seenIds = new Set<string>();
  const uniqueList: Message[] = [];

  for (const msg of msgList) {
    if (!msg || !msg.id) continue;
    if (!seenIds.has(msg.id)) {
      seenIds.add(msg.id);
      uniqueList.push(msg);
    }
  }

  return uniqueList;
}

export function ChatWidget() {
  const searchParams = useSearchParams();
  const widgetKey = searchParams.get("key") || searchParams.get("public_widget_key");

  const [config, setConfig] = useState<WidgetConfig | null>(null);
  const [visitorId, setVisitorId] = useState<string>(() =>
    typeof window !== "undefined" ? getOrCreateVisitorId() : "",
  );
  const [conversationId, setConversationId] = useState<string | null>(() =>
    widgetKey && typeof window !== "undefined" ? getStoredConversationId(widgetKey) : null,
  );
  const [conversationStatus, setConversationStatus] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(widgetKey));
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(
    widgetKey ? null : "No public widget key provided in the URL query (?key=pk_live_...).",
  );
  const [chatError, setChatError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isPollingRef = useRef(false);

  const getWelcomeMessage = useCallback(
    (customWelcome?: string): Message => ({
      id: "welcome-msg",
      sender: "bot",
      text: customWelcome || config?.welcome_message || "Hi! How can we help you today?",
      time: formatTime(),
    }),
    [config?.welcome_message],
  );

  // 1. Initial Widget Configuration & History Initialization
  useEffect(() => {
    if (!widgetKey) return;

    let isMounted = true;

    async function initializeWidget() {
      try {
        const vid = getOrCreateVisitorId();
        if (isMounted) setVisitorId(vid);

        // 1. Fetch public branding configuration
        const configRes = await fetch(`/api/widget/config?key=${encodeURIComponent(widgetKey!)}`);
        const configData = await configRes.json();

        if (!configRes.ok) {
          throw new Error(configData.error || "Failed to load widget configuration.");
        }

        if (!isMounted) return;
        setConfig(configData);

        const welcomeMsg = getWelcomeMessage(configData.welcome_message);

        // 2. Check for previously stored active conversation
        const storedConv = getStoredConversationId(widgetKey!);
        if (storedConv) {
          try {
            const chatRes = await fetch(
              `/api/widget/chat?key=${encodeURIComponent(widgetKey!)}&visitor_id=${encodeURIComponent(vid)}&conversation_id=${encodeURIComponent(storedConv)}`,
            );

            if (chatRes.ok) {
              const chatData = await chatRes.json();
              if (isMounted) {
                setConversationId(storedConv);
                if (chatData.status) {
                  setConversationStatus(chatData.status);
                }

                const historyMsgs: Message[] = (chatData.messages || []).map((m: ApiMessage) => ({
                  id: m.id,
                  sender: m.sender_type,
                  text: m.content,
                  time: formatTime(m.created_at),
                }));

                setMessages(deduplicateMessages([welcomeMsg, ...historyMsgs]));
                setIsLoading(false);
                return;
              }
            }
          } catch {
            // Ignore history fetch errors and fall back to initial welcome message
          }
        }

        if (isMounted) {
          setMessages([welcomeMsg]);
          setIsLoading(false);
        }
      } catch (err: unknown) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : "Failed to load widget configuration.");
          setIsLoading(false);
        }
      }
    }

    initializeWidget();

    return () => {
      isMounted = false;
    };
  }, [widgetKey, getWelcomeMessage]);

  // 2. Lightweight Polling for Live Agent Messages (Active while widget is open)
  useEffect(() => {
    if (!isOpen || !widgetKey || !conversationId) return;

    const vid = visitorId || getOrCreateVisitorId();
    let isCancelled = false;

    const pollMessages = async () => {
      if (isPollingRef.current || isCancelled) return;
      isPollingRef.current = true;

      try {
        const res = await fetch(
          `/api/widget/chat?key=${encodeURIComponent(widgetKey)}&visitor_id=${encodeURIComponent(vid)}&conversation_id=${encodeURIComponent(conversationId)}`,
        );

        if (res.ok && !isCancelled) {
          const data = await res.json();
          if (data.status) {
            setConversationStatus(data.status);
          }

          if (Array.isArray(data.messages)) {
            const welcomeMsg = getWelcomeMessage();
            const fetchedMsgs: Message[] = data.messages.map((m: ApiMessage) => ({
              id: m.id,
              sender: m.sender_type,
              text: m.content,
              time: formatTime(m.created_at),
            }));

            // Replace messages state deterministically with deduplication
            setMessages((prev) => {
              return deduplicateMessages([welcomeMsg, ...fetchedMsgs, ...prev]);
            });
          }
        }
      } catch {
        // Polling network errors are silent to prevent jarring UI flicker
      } finally {
        isPollingRef.current = false;
      }
    };

    const intervalId = setInterval(pollMessages, POLLING_INTERVAL_MS);

    return () => {
      isCancelled = true;
      clearInterval(intervalId);
    };
  }, [isOpen, widgetKey, conversationId, visitorId, getWelcomeMessage]);

  // 3. Auto-scroll on new message or open
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages.length, isOpen]);

  // 4. Send Message Handler (handles both form submit and suggested question click)
  const handleSendMessage = async (e?: React.FormEvent, customText?: string) => {
    if (e) e.preventDefault();
    const userText = (customText ?? inputMessage).trim();
    if (!userText || !widgetKey || isSending) return;

    const vid = visitorId || getOrCreateVisitorId();

    setIsSending(true);
    setChatError(null);

    try {
      const res = await fetch("/api/widget/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          key: widgetKey,
          visitor_id: vid,
          conversation_id: conversationId || undefined,
          content: userText,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to send message.");
      }

      // Update active conversation ID and status
      if (data.conversation_id) {
        setConversationId(data.conversation_id);
        setStoredConversationId(widgetKey, data.conversation_id);
      }

      if (data.status) {
        setConversationStatus(data.status);
      }

      // Append verified user message
      const createdMsg: Message = {
        id: data.message?.id || generateFallbackMessageId("user"),
        sender: "user",
        text: data.message?.content || userText,
        time: formatTime(data.message?.created_at),
      };

      const newMessages: Message[] = [createdMsg];

      // Append reply if present (e.g. AI bot answer or handoff message)
      if (data.reply?.content) {
        newMessages.push({
          id: data.reply.id || generateFallbackMessageId("reply"),
          sender: data.reply.sender_type || "bot",
          text: data.reply.content,
          time: formatTime(data.reply.created_at),
        });
      }

      setMessages((prev) => deduplicateMessages([...prev, ...newMessages]));
      setInputMessage("");
    } catch (err: unknown) {
      setChatError(err instanceof Error ? err.message : "Failed to send message.");
    } finally {
      setIsSending(false);
    }
  };

  const handleSelectSuggestedQuestion = async (question: string) => {
    await handleSendMessage(undefined, question);
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
  const isEscalated = conversationStatus === "escalated";

  // Check if waiting for agent (conversation is escalated and last message is user or bot handoff)
  const lastMsg = messages.length > 0 ? messages[messages.length - 1] : null;
  const isWaitingForAgent = isEscalated && (lastMsg?.sender === "user" || lastMsg?.id?.startsWith("reply-"));

  const hasUserMessages = messages.some((m) => m.sender === "user");
  const suggestedQuestions = config.suggested_questions || [];
  const showSuggestedQuestions =
    !hasUserMessages &&
    !isEscalated &&
    suggestedQuestions.length > 0;

  return (
    <div className={`fixed ${positionClasses} z-50 font-sans ${isLeft ? "flex flex-col items-start" : "flex flex-col items-end"}`}>
      {/* Expanded Chat Panel */}
      {isOpen && (
        <div
          className="mb-4 flex h-[520px] max-h-[calc(100vh-100px)] w-[360px] max-w-[calc(100vw-32px)] flex-col overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-2xl transition-all duration-200 dark:border-zinc-800 dark:bg-zinc-900 sm:w-[380px]"
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
                    unoptimized
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
                  <span className={`h-1.5 w-1.5 rounded-full ${isEscalated ? "bg-amber-400 animate-pulse" : "bg-emerald-400"}`}></span>
                  {isEscalated ? "Support Team Connected" : "Online"}
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

          {/* Escalation Notification Banner */}
          {isEscalated && (
            <div className="flex items-center gap-2 border-b border-amber-200/80 bg-amber-50/90 px-3.5 py-2 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/60 dark:text-amber-200">
              <svg className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <span className="leading-tight">
                A human support agent has joined this conversation.
              </span>
            </div>
          )}

          {/* Messages Stream */}
          <div className="flex-1 space-y-3.5 overflow-y-auto p-4 bg-zinc-50/50 dark:bg-zinc-950/30">
            {messages.map((msg) => {
              const isUser = msg.sender === "user";
              const isBot = msg.sender === "bot";
              const isAgent = msg.sender === "agent";

              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}
                >
                  {/* Sender Label */}
                  <div className="mb-1 flex items-center gap-1.5 px-1 text-[10px] text-zinc-400 dark:text-zinc-500">
                    <span className="font-medium">
                      {isUser ? "You" : isBot ? config.brand_name + " AI" : "Support Agent"}
                    </span>
                    <span>•</span>
                    <span>{msg.time}</span>
                  </div>

                  {/* Message Bubble */}
                  <div
                    style={isUser ? { backgroundColor: brandColor } : undefined}
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs shadow-2xs leading-relaxed ${
                      isUser
                        ? "rounded-tr-xs text-white"
                        : isAgent
                        ? "rounded-tl-xs border border-indigo-200 bg-indigo-50/90 text-indigo-950 dark:border-indigo-900/50 dark:bg-indigo-950/70 dark:text-indigo-200"
                        : "rounded-tl-xs border border-zinc-200/60 bg-white text-zinc-800 dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-100"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{msg.text}</p>
                  </div>
                </div>
              );
            })}

            {/* Suggested Questions (only shown before user sends first message) */}
            {showSuggestedQuestions && (
              <div className="space-y-1.5 pt-1" aria-label="Suggested questions">
                <p className="px-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                  Suggested Questions
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {suggestedQuestions.map((question, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleSelectSuggestedQuestion(question)}
                      disabled={isSending}
                      className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-left text-xs font-medium text-zinc-700 shadow-2xs transition-all hover:border-zinc-300 hover:bg-zinc-50 hover:shadow-xs active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700/80"
                    >
                      {question}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Waiting for Agent Typing/Pending Indicator */}
            {isWaitingForAgent && (
              <div className="flex items-center gap-2 rounded-xl border border-zinc-200/60 bg-white px-3 py-2 text-[11px] text-zinc-500 dark:border-zinc-800 dark:bg-zinc-800/80 dark:text-zinc-400 max-w-fit">
                <div className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400" style={{ animationDelay: "0ms" }}></span>
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400" style={{ animationDelay: "150ms" }}></span>
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400" style={{ animationDelay: "300ms" }}></span>
                </div>
                <span>Waiting for a support agent...</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Chat Error Notice */}
          {chatError && (
            <div className="border-t border-red-200 bg-red-50 px-3 py-1.5 text-center text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-300">
              {chatError}
            </div>
          )}

          {/* Input Bar */}
          <form
            onSubmit={handleSendMessage}
            className="flex items-center gap-2 border-t border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900"
          >
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder={isEscalated ? "Reply to support agent..." : "Type a message..."}
              disabled={isSending}
              className="flex-1 rounded-xl border border-zinc-300 bg-white px-3.5 py-2 text-xs text-zinc-900 placeholder:text-zinc-500 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder:text-zinc-400 dark:focus:border-zinc-400 dark:focus:ring-zinc-400"
            />
            <button
              type="submit"
              disabled={!inputMessage.trim() || isSending}
              style={{ backgroundColor: inputMessage.trim() && !isSending ? brandColor : undefined }}
              aria-label="Send message"
              className={`flex h-8 w-8 items-center justify-center rounded-xl transition-all ${
                inputMessage.trim() && !isSending
                  ? "text-white shadow-xs hover:opacity-90 active:scale-95"
                  : "bg-zinc-100 text-zinc-400 cursor-not-allowed dark:bg-zinc-800 dark:text-zinc-600"
              }`}
            >
              {isSending ? (
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white"></div>
              ) : (
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              )}
            </button>
          </form>
        </div>
      )}

      {/* Launcher Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{ backgroundColor: brandColor }}
        aria-label={
          isOpen
            ? "Close support chat"
            : config.launcher_text?.trim()
            ? `Open support chat: ${config.launcher_text.trim()}`
            : "Open support chat"
        }
        className={`text-white shadow-xl transition-transform duration-200 hover:scale-105 active:scale-95 focus:outline-none focus:ring-4 focus:ring-zinc-400/30 ${
          !isOpen && config.launcher_text?.trim()
            ? "inline-flex items-center gap-2.5 rounded-full px-5 py-3.5 text-sm font-semibold"
            : "flex h-14 w-14 items-center justify-center rounded-full"
        }`}
      >
        {isOpen ? (
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <>
            <svg className="h-6 w-6 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>
            {config.launcher_text?.trim() && (
              <span className="whitespace-nowrap">{config.launcher_text.trim()}</span>
            )}
          </>
        )}
      </button>
    </div>
  );
}
