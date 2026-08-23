"use client";

import { useState, useMemo } from "react";
import type { ConversationStatus, MessageSenderType } from "@/types/database.types";

export interface ConversationMessageItem {
  id: string;
  conversation_id: string;
  sender_type: MessageSenderType;
  sender_id: string | null;
  content: string;
  tokens_prompt: number | null;
  tokens_completion: number | null;
  latency_ms: number | null;
  created_at: string;
}

export interface ConversationThreadItem {
  id: string;
  visitor_id: string;
  customer_name: string | null;
  customer_email: string | null;
  status: ConversationStatus;
  last_message_at: string;
  created_at: string;
  updated_at: string;
  messages: ConversationMessageItem[];
}

interface ConversationsInboxProps {
  conversations: ConversationThreadItem[];
}

type FilterTab = "all" | ConversationStatus;

export function ConversationsInbox({ conversations }: ConversationsInboxProps) {
  const [selectedFilter, setSelectedFilter] = useState<FilterTab>("all");
  const [selectedConvId, setSelectedConvId] = useState<string | null>(() => {
    return conversations.length > 0 ? conversations[0].id : null;
  });

  // Calculate status counts
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: conversations.length,
      active: 0,
      escalated: 0,
      resolved: 0,
      closed: 0,
    };
    for (const conv of conversations) {
      if (counts[conv.status] !== undefined) {
        counts[conv.status]++;
      }
    }
    return counts;
  }, [conversations]);

  // Filter conversations
  const filteredConversations = useMemo(() => {
    if (selectedFilter === "all") return conversations;
    return conversations.filter((c) => c.status === selectedFilter);
  }, [conversations, selectedFilter]);

  // Active selected conversation
  const selectedConversation = useMemo(() => {
    if (!selectedConvId) {
      return filteredConversations.length > 0 ? filteredConversations[0] : null;
    }
    return (
      conversations.find((c) => c.id === selectedConvId) ||
      (filteredConversations.length > 0 ? filteredConversations[0] : null)
    );
  }, [conversations, filteredConversations, selectedConvId]);

  // Chronologically sorted messages for the selected conversation
  const sortedMessages = useMemo(() => {
    if (!selectedConversation?.messages) return [];
    return [...selectedConversation.messages].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
  }, [selectedConversation]);

  const getStatusBadgeClasses = (status: ConversationStatus) => {
    switch (status) {
      case "active":
        return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20 ring-inset dark:bg-emerald-950/50 dark:text-emerald-300";
      case "escalated":
        return "bg-rose-50 text-rose-700 ring-1 ring-rose-600/20 ring-inset dark:bg-rose-950/50 dark:text-rose-300";
      case "resolved":
        return "bg-blue-50 text-blue-700 ring-1 ring-blue-600/20 ring-inset dark:bg-blue-950/50 dark:text-blue-300";
      case "closed":
        return "bg-zinc-100 text-zinc-600 ring-1 ring-zinc-500/20 ring-inset dark:bg-zinc-800 dark:text-zinc-400";
      default:
        return "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400";
    }
  };

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function formatTimestamp(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;

  const month = MONTH_NAMES[d.getUTCMonth()];
  const day = d.getUTCDate();
  const rawHours = d.getUTCHours();
  const minutes = d.getUTCMinutes().toString().padStart(2, "0");
  const period = rawHours >= 12 ? "PM" : "AM";
  const hours = (rawHours % 12 || 12).toString().padStart(2, "0");

  return `${month} ${day}, ${hours}:${minutes} ${period}`;
}

  const formatVisitorId = (id: string) => {
    if (id.startsWith("vis_") && id.length > 12) {
      return `Visitor ${id.slice(4, 12)}...`;
    }
    return id.length > 16 ? `${id.slice(0, 16)}...` : id;
  };

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      {/* Section Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Conversations Inbox
            </h2>
            <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              {conversations.length} {conversations.length === 1 ? "thread" : "threads"}
            </span>
          </div>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Monitor and inspect live and past customer support conversations handled by the AI widget.
          </p>
        </div>
      </div>

      {/* Status Filter Tabs */}
      <div className="mt-5 flex flex-wrap items-center gap-1.5 border-b border-zinc-200 pb-3.5 dark:border-zinc-800">
        {(["all", "active", "escalated", "resolved", "closed"] as FilterTab[]).map((tab) => {
          const count = statusCounts[tab] || 0;
          const isActive = selectedFilter === tab;
          return (
            <button
              key={tab}
              type="button"
              onClick={() => setSelectedFilter(tab)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                isActive
                  ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900"
                  : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
              }`}
            >
              <span>{tab}</span>
              <span
                className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                  isActive
                    ? "bg-zinc-700 text-white dark:bg-zinc-300 dark:text-zinc-900"
                    : "bg-zinc-200/70 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Main Inbox View: Split List & Transcript */}
      {conversations.length === 0 ? (
        <div className="mt-6 flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300 p-10 text-center dark:border-zinc-700">
          <svg
            className="h-10 w-10 text-zinc-400 dark:text-zinc-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            />
          </svg>
          <h4 className="mt-3 text-sm font-semibold text-zinc-800 dark:text-zinc-200">
            No visitor conversations yet
          </h4>
          <p className="mt-1 max-w-sm text-xs text-zinc-500 dark:text-zinc-400">
            When visitors interact with your support widget, their live chat sessions and AI responses will appear here in real time.
          </p>
        </div>
      ) : filteredConversations.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-zinc-300 p-8 text-center text-xs text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          No {selectedFilter} conversations found.
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Thread List Pane (5 cols on lg) */}
          <div className="space-y-2.5 lg:col-span-5 max-h-[600px] overflow-y-auto pr-1">
            {filteredConversations.map((conv) => {
              const isSelected = selectedConversation?.id === conv.id;
              const lastMessage =
                conv.messages && conv.messages.length > 0
                  ? conv.messages[conv.messages.length - 1]
                  : null;

              return (
                <button
                  key={conv.id}
                  type="button"
                  onClick={() => setSelectedConvId(conv.id)}
                  className={`w-full text-left rounded-2xl p-4 transition-all border ${
                    isSelected
                      ? "border-zinc-900 bg-zinc-50 shadow-xs ring-1 ring-zinc-900 dark:border-zinc-400 dark:bg-zinc-800/80 dark:ring-zinc-400"
                      : "border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50/50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                      {conv.customer_name || formatVisitorId(conv.visitor_id)}
                    </span>
                    <span
                      className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-medium capitalize shrink-0 ${getStatusBadgeClasses(
                        conv.status,
                      )}`}
                    >
                      {conv.status}
                    </span>
                  </div>

                  {conv.customer_email && (
                    <p className="mt-0.5 text-[11px] text-zinc-400 dark:text-zinc-500 truncate">
                      {conv.customer_email}
                    </p>
                  )}

                  {/* Latest Message Snippet */}
                  <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-300 line-clamp-2 leading-relaxed">
                    {lastMessage ? (
                      <>
                        <span className="font-medium text-zinc-700 dark:text-zinc-200">
                          {lastMessage.sender_type === "bot"
                            ? "AI: "
                            : lastMessage.sender_type === "agent"
                            ? "Agent: "
                            : "Visitor: "}
                        </span>
                        {lastMessage.content}
                      </>
                    ) : (
                      <span className="italic text-zinc-400">No messages recorded</span>
                    )}
                  </p>

                  <div className="mt-2.5 flex items-center justify-between text-[10px] text-zinc-400 dark:text-zinc-500">
                    <span>{formatTimestamp(conv.last_message_at || conv.created_at)}</span>
                    <span>
                      {conv.messages ? conv.messages.length : 0}{" "}
                      {conv.messages?.length === 1 ? "msg" : "msgs"}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Transcript Viewer Pane (7 cols on lg) */}
          <div className="lg:col-span-7 flex flex-col rounded-2xl border border-zinc-200 bg-zinc-50/40 dark:border-zinc-800 dark:bg-zinc-950/40 overflow-hidden h-[600px]">
            {selectedConversation ? (
              <>
                {/* Transcript Header */}
                <div className="flex items-center justify-between border-b border-zinc-200 bg-white px-5 py-3.5 dark:border-zinc-800 dark:bg-zinc-900 shrink-0">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-mono text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                        {selectedConversation.customer_name || selectedConversation.visitor_id}
                      </h3>
                      <span
                        className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-medium capitalize ${getStatusBadgeClasses(
                          selectedConversation.status,
                        )}`}
                      >
                        {selectedConversation.status}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-zinc-400 dark:text-zinc-500">
                      Started {formatTimestamp(selectedConversation.created_at)} •{" "}
                      {sortedMessages.length} total messages
                    </p>
                  </div>
                </div>

                {/* Messages Stream */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
                  {sortedMessages.length === 0 ? (
                    <div className="flex h-full items-center justify-center text-xs text-zinc-400">
                      No messages in this conversation thread.
                    </div>
                  ) : (
                    sortedMessages.map((msg) => {
                      const isUser = msg.sender_type === "user";
                      const isBot = msg.sender_type === "bot";

                      return (
                        <div
                          key={msg.id}
                          className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}
                        >
                          <div className="flex items-center gap-1.5 mb-1 px-1 text-[10px] text-zinc-400 dark:text-zinc-500">
                            <span className="font-medium">
                              {isUser ? "Visitor" : isBot ? "AI Support Bot" : "Human Agent"}
                            </span>
                            <span>•</span>
                            <span>{formatTimestamp(msg.created_at)}</span>
                            {msg.latency_ms && (
                              <>
                                <span>•</span>
                                <span>{msg.latency_ms}ms</span>
                              </>
                            )}
                          </div>

                          <div
                            className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-xs leading-relaxed shadow-2xs ${
                              isUser
                                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 rounded-tr-xs"
                                : isBot
                                ? "border border-zinc-200/80 bg-white text-zinc-800 dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-100 rounded-tl-xs"
                                : "border border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/60 dark:text-blue-200 rounded-tl-xs"
                            }`}
                          >
                            <p className="whitespace-pre-wrap">{msg.content}</p>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </>
            ) : (
              <div className="flex h-full items-center justify-center p-6 text-center text-xs text-zinc-400">
                Select a conversation thread to view the full message transcript.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
