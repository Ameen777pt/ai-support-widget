"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { ConversationStatus, MessageSenderType } from "@/types/database.types";
import {
  claimConversationAction,
  sendAgentReplyAction,
  updateConversationStatusAction,
} from "@/app/actions/conversations";

export interface ConversationEscalationItem {
  id: string;
  reason: string;
  status: string;
  assigned_to: string | null;
  customer_email: string | null;
  notes: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

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
  escalations?: ConversationEscalationItem[];
}

interface ConversationsInboxProps {
  conversations: ConversationThreadItem[];
  currentUserId?: string;
  initialConversationId?: string | null;
}

type FilterTab = "all" | ConversationStatus;

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

function formatVisitorId(id: string): string {
  if (id.startsWith("vis_") && id.length > 12) {
    return `Visitor ${id.slice(4, 12)}...`;
  }
  return id.length > 16 ? `${id.slice(0, 16)}...` : id;
}

export function ConversationsInbox({
  conversations,
  currentUserId,
  initialConversationId,
}: ConversationsInboxProps) {
  const router = useRouter();
  const [selectedFilter, setSelectedFilter] = useState<FilterTab>("all");
  const [selectedConvId, setSelectedConvId] = useState<string | null>(() => {
    if (initialConversationId && conversations.some((c) => c.id === initialConversationId)) {
      return initialConversationId;
    }
    return conversations.length > 0 ? conversations[0].id : null;
  });

  const [mobileShowDetail, setMobileShowDetail] = useState<boolean>(() => {
    return Boolean(
      initialConversationId && conversations.some((c) => c.id === initialConversationId)
    );
  });

  const [prevInitialId, setPrevInitialId] = useState(initialConversationId);

  if (initialConversationId !== prevInitialId) {
    setPrevInitialId(initialConversationId);
    if (initialConversationId && conversations.some((c) => c.id === initialConversationId)) {
      setSelectedConvId(initialConversationId);
      setMobileShowDetail(true);
      const targetConv = conversations.find((c) => c.id === initialConversationId);
      if (targetConv && selectedFilter !== "all" && targetConv.status !== selectedFilter) {
        setSelectedFilter("all");
      }
    }
  }

  // Reply Composer State
  const [replyText, setReplyText] = useState("");
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);

  // Status / Claim Action State
  const [isSubmittingAction, setIsSubmittingAction] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

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

  // Auto-scroll messages stream on thread select or message append
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [sortedMessages.length, selectedConvId]);

  // Escalation & Assignment Metadata for Selected Conversation
  const latestEscalation = useMemo(() => {
    if (!selectedConversation?.escalations || selectedConversation.escalations.length === 0) {
      return null;
    }
    return selectedConversation.escalations[0];
  }, [selectedConversation]);

  const isEscalated = selectedConversation?.status === "escalated";
  const isAssigned = isEscalated && latestEscalation?.status === "assigned" && Boolean(latestEscalation.assigned_to);
  const isClaimedByMe = isAssigned && Boolean(currentUserId) && latestEscalation?.assigned_to === currentUserId;
  const isClosed = selectedConversation?.status === "closed";
  const isResolved = selectedConversation?.status === "resolved";

  // Actions
  const handleClaim = async () => {
    if (!selectedConversation || isSubmittingAction) return;
    setIsSubmittingAction(true);
    setActionError(null);
    setActionNotice(null);

    try {
      const res = await claimConversationAction(selectedConversation.id);
      if (!res.success) {
        setActionError(res.error || "Failed to claim conversation.");
      } else {
        setActionNotice(res.message || "Conversation claimed successfully.");
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "An unexpected error occurred.");
    } finally {
      setIsSubmittingAction(false);
    }
  };

  const handleUpdateStatus = async (newStatus: ConversationStatus) => {
    if (!selectedConversation || isSubmittingAction) return;
    setIsSubmittingAction(true);
    setActionError(null);
    setActionNotice(null);

    try {
      const res = await updateConversationStatusAction(selectedConversation.id, newStatus);
      if (!res.success) {
        setActionError(res.error || `Failed to update status to ${newStatus}.`);
      } else {
        setActionNotice(res.message || `Status updated to ${newStatus}.`);
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "An unexpected error occurred.");
    } finally {
      setIsSubmittingAction(false);
    }
  };

  const handleSendAgentReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedConversation || !replyText.trim() || isSendingReply || isClosed) return;

    const content = replyText.trim();
    if (content.length < 1 || content.length > 3000) {
      setReplyError("Message must be between 1 and 3,000 characters.");
      return;
    }

    setIsSendingReply(true);
    setReplyError(null);

    try {
      const res = await sendAgentReplyAction(selectedConversation.id, content);
      if (!res.success) {
        setReplyError(res.error || "Failed to send agent reply.");
      } else {
        setReplyText("");
      }
    } catch (err) {
      setReplyError(err instanceof Error ? err.message : "Failed to send agent reply.");
    } finally {
      setIsSendingReply(false);
    }
  };

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

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 sm:p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      {/* Section Header */}
      <div className={`flex flex-col gap-2 ${mobileShowDetail ? "hidden md:flex" : "flex"} sm:flex-row sm:items-center sm:justify-between`}>
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
            Monitor, take over, and resolve customer support conversations across your organization.
          </p>
        </div>
      </div>

      {/* Status Filter Tabs */}
      <div
        role="tablist"
        aria-label="Filter conversations by status"
        className={`mt-5 ${mobileShowDetail ? "hidden md:flex" : "flex"} flex-wrap items-center gap-1.5 border-b border-zinc-200 pb-3.5 dark:border-zinc-800`}
      >
        {(["all", "active", "escalated", "resolved", "closed"] as FilterTab[]).map((tab) => {
          const count = statusCounts[tab] || 0;
          const isActive = selectedFilter === tab;
          const isEscalatedTab = tab === "escalated";

          return (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setSelectedFilter(tab)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 sm:py-1.5 min-h-[40px] sm:min-h-0 text-xs font-medium capitalize transition-colors ${
                isActive
                  ? isEscalatedTab
                    ? "bg-rose-600 text-white dark:bg-rose-600 dark:text-white"
                    : "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900"
                  : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
              }`}
            >
              <span>{tab}</span>
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                  isActive
                    ? "bg-black/20 text-white"
                    : isEscalatedTab && count > 0
                    ? "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300"
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
        <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-12">
          {/* Thread List Pane (5 cols on md+) */}
          <div
            className={`space-y-2.5 md:col-span-5 max-h-[640px] overflow-y-auto pr-1 ${
              mobileShowDetail ? "hidden md:block" : "block"
            }`}
          >
            {filteredConversations.map((conv) => {
              const isSelected = selectedConversation?.id === conv.id;
              const lastMessage =
                conv.messages && conv.messages.length > 0
                  ? conv.messages[conv.messages.length - 1]
                  : null;

              const esc = conv.escalations && conv.escalations.length > 0 ? conv.escalations[0] : null;
              const isConvEscalated = conv.status === "escalated";
              const isConvClaimedByMe =
                isConvEscalated &&
                esc?.status === "assigned" &&
                Boolean(currentUserId) &&
                esc?.assigned_to === currentUserId;
              const isConvAssignedOther =
                isConvEscalated &&
                esc?.status === "assigned" &&
                Boolean(esc?.assigned_to) &&
                esc?.assigned_to !== currentUserId;

              return (
                <button
                  key={conv.id}
                  type="button"
                  aria-current={isSelected ? "true" : undefined}
                  onClick={() => {
                    setSelectedConvId(conv.id);
                    setMobileShowDetail(true);
                    setActionError(null);
                    setActionNotice(null);
                    router.replace(
                      `/dashboard?view=inbox&conversationId=${encodeURIComponent(conv.id)}`,
                      { scroll: false },
                    );
                  }}
                  className={`w-full text-left rounded-2xl p-3 sm:p-4 transition-all border ${
                    isSelected
                      ? "border-zinc-900 bg-zinc-50 shadow-xs ring-1 ring-zinc-900 dark:border-zinc-400 dark:bg-zinc-800/80 dark:ring-zinc-400"
                      : "border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50/50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                      {conv.customer_name || formatVisitorId(conv.visitor_id)}
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {isConvEscalated && (
                        <span
                          className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium border ${
                            isConvClaimedByMe
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/40"
                              : isConvAssignedOther
                              ? "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/40"
                              : "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/40"
                          }`}
                        >
                          {isConvClaimedByMe
                            ? "Claimed by you"
                            : isConvAssignedOther
                            ? "Assigned"
                            : "⚠️ Unassigned"}
                        </span>
                      )}
                      <span
                        className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-medium capitalize shrink-0 ${getStatusBadgeClasses(
                          conv.status,
                        )}`}
                      >
                        {conv.status}
                      </span>
                    </div>
                  </div>

                  {conv.customer_email && (
                    <p className="mt-0.5 text-[11px] text-zinc-400 dark:text-zinc-500 truncate">
                      {conv.customer_email}
                    </p>
                  )}

                  {/* Latest Message Snippet */}
                  <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-300 line-clamp-2 leading-relaxed break-words">
                    {lastMessage ? (
                      <>
                        <span className="font-medium text-zinc-700 dark:text-zinc-200">
                          {lastMessage.sender_type === "bot"
                            ? "AI: "
                            : lastMessage.sender_type === "agent"
                            ? "Support Agent: "
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

          {/* Transcript Viewer Pane (7 cols on md+) */}
          <div
            className={`md:col-span-7 flex flex-col rounded-2xl border border-zinc-200 bg-zinc-50/40 dark:border-zinc-800 dark:bg-zinc-950/40 overflow-hidden h-[calc(100dvh-180px)] min-h-[480px] md:h-[640px] ${
              mobileShowDetail ? "flex" : "hidden md:flex"
            }`}
          >
            {selectedConversation ? (
              <>
                {/* Transcript Header & Action Bar */}
                <div className="border-b border-zinc-200 bg-white p-3.5 sm:px-5 sm:py-3.5 dark:border-zinc-800 dark:bg-zinc-900 shrink-0 space-y-2.5 sm:space-y-3">
                  <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
                    {/* Row 1 on mobile: Back button, Visitor identifier, Status badge */}
                    <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
                      {/* Mobile Back Button */}
                      <button
                        type="button"
                        onClick={() => setMobileShowDetail(false)}
                        aria-label="Back to conversations list"
                        className="inline-flex md:hidden items-center justify-center gap-1 shrink-0 rounded-xl border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-zinc-700 shadow-2xs hover:bg-zinc-50 active:scale-95 transition-all dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 min-h-[40px] min-w-[40px] focus:outline-none focus:ring-2 focus:ring-zinc-500 focus:ring-offset-2"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                        <span className="text-xs font-medium">Back</span>
                      </button>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h3 className="font-mono text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                            {selectedConversation.customer_name || formatVisitorId(selectedConversation.visitor_id)}
                          </h3>
                          <span
                            className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-medium capitalize shrink-0 ${getStatusBadgeClasses(
                              selectedConversation.status,
                            )}`}
                          >
                            {selectedConversation.status}
                          </span>
                          {isClaimedByMe && (
                            <span className="rounded-md bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-300 shrink-0">
                              ✓ Claimed by you
                            </span>
                          )}
                          {isAssigned && !isClaimedByMe && (
                            <span className="rounded-md bg-blue-50 border border-blue-200 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-950/40 dark:border-blue-800 dark:text-blue-300 shrink-0">
                              Assigned
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-[11px] text-zinc-400 dark:text-zinc-500 truncate">
                          Started {formatTimestamp(selectedConversation.created_at)} •{" "}
                          {sortedMessages.length} messages
                        </p>
                      </div>
                    </div>

                    {/* Row 2 on mobile: Action Bar Buttons */}
                    <div className="flex flex-wrap items-center gap-1.5 shrink-0 pt-1.5 sm:pt-0 border-t border-zinc-100 sm:border-0 dark:border-zinc-800/60">
                      {/* Active State Actions */}
                      {selectedConversation.status === "active" && (
                        <button
                          type="button"
                          disabled={isSubmittingAction}
                          onClick={() => handleUpdateStatus("escalated")}
                          className="inline-flex items-center rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-2 sm:py-1 text-xs font-medium text-rose-700 shadow-2xs hover:bg-rose-100 disabled:opacity-60 dark:border-rose-900/50 dark:bg-rose-950/50 dark:text-rose-300 min-h-[38px] sm:min-h-0"
                        >
                          Escalate to Human
                        </button>
                      )}

                      {/* Escalated State Actions */}
                      {isEscalated && (
                        <>
                          {!isClaimedByMe && (
                            <button
                              type="button"
                              disabled={isSubmittingAction}
                              onClick={handleClaim}
                              className="inline-flex items-center rounded-lg bg-zinc-900 px-2.5 py-2 sm:py-1 text-xs font-medium text-white shadow-2xs hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200 min-h-[38px] sm:min-h-0"
                            >
                              {isAssigned ? "Take Over" : "Claim Conversation"}
                            </button>
                          )}

                          <button
                            type="button"
                            disabled={isSubmittingAction}
                            onClick={() => handleUpdateStatus("active")}
                            className="inline-flex items-center rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-2 sm:py-1 text-xs font-medium text-amber-800 shadow-2xs hover:bg-amber-100 disabled:opacity-60 dark:border-amber-900/50 dark:bg-amber-950/50 dark:text-amber-300 min-h-[38px] sm:min-h-0"
                          >
                            Return to AI
                          </button>
                        </>
                      )}

                      {/* Resolve Action */}
                      {!isClosed && !isResolved && (
                        <button
                          type="button"
                          disabled={isSubmittingAction}
                          onClick={() => handleUpdateStatus("resolved")}
                          className="inline-flex items-center rounded-lg border border-zinc-300 bg-white px-2.5 py-2 sm:py-1 text-xs font-medium text-zinc-700 shadow-2xs hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 min-h-[38px] sm:min-h-0"
                        >
                          Resolve
                        </button>
                      )}

                      {/* Close Action */}
                      {!isClosed && (
                        <button
                          type="button"
                          disabled={isSubmittingAction}
                          onClick={() => handleUpdateStatus("closed")}
                          className="inline-flex items-center rounded-lg border border-zinc-300 bg-white px-2.5 py-2 sm:py-1 text-xs font-medium text-zinc-600 shadow-2xs hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400 min-h-[38px] sm:min-h-0"
                        >
                          Close
                        </button>
                      )}

                      {/* Reopen Action for Closed/Resolved */}
                      {(isClosed || isResolved) && (
                        <button
                          type="button"
                          disabled={isSubmittingAction}
                          onClick={() => handleUpdateStatus("active")}
                          className="inline-flex items-center rounded-lg border border-zinc-300 bg-white px-2.5 py-2 sm:py-1 text-xs font-medium text-zinc-700 shadow-2xs hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 min-h-[38px] sm:min-h-0"
                        >
                          Reopen
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Feedback / Alert Banners */}
                  {actionError && (
                    <div className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/60 dark:text-red-300">
                      <span>{actionError}</span>
                      <button
                        type="button"
                        onClick={() => setActionError(null)}
                        aria-label="Dismiss error"
                        className="ml-2 font-bold hover:opacity-75 min-h-[40px] min-w-[40px] sm:min-h-0 sm:min-w-0 p-2 sm:p-0.5 inline-flex items-center justify-center"
                      >
                        ×
                      </button>
                    </div>
                  )}

                  {actionNotice && (
                    <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/60 dark:text-emerald-300">
                      <span>{actionNotice}</span>
                      <button
                        type="button"
                        onClick={() => setActionNotice(null)}
                        aria-label="Dismiss message"
                        className="ml-2 font-bold hover:opacity-75 min-h-[40px] min-w-[40px] sm:min-h-0 sm:min-w-0 p-2 sm:p-0.5 inline-flex items-center justify-center"
                      >
                        ×
                      </button>
                    </div>
                  )}
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
                              {isUser ? "Visitor" : isBot ? "AI Support Bot" : "Support Agent"}
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
                            className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-xs leading-relaxed shadow-2xs break-words [overflow-wrap:anywhere] ${
                              isUser
                                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 rounded-tr-xs"
                                : isBot
                                ? "border border-zinc-200/80 bg-white text-zinc-800 dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-100 rounded-tl-xs"
                                : "border border-indigo-200 bg-indigo-50 text-indigo-950 dark:border-indigo-900/60 dark:bg-indigo-950/60 dark:text-indigo-200 rounded-tl-xs"
                            }`}
                          >
                            <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{msg.content}</p>
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Agent Reply Composer */}
                <div className="border-t border-zinc-200 bg-white p-3.5 dark:border-zinc-800 dark:bg-zinc-900 shrink-0">
                  {replyError && (
                    <div className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-300">
                      {replyError}
                    </div>
                  )}

                  {isClosed ? (
                    <div className="rounded-xl border border-zinc-200 bg-zinc-50 py-2.5 px-3 text-center text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950/50 dark:text-zinc-400">
                      This conversation is closed and archived. Reopen to send replies.
                    </div>
                  ) : (
                    <form onSubmit={handleSendAgentReply} className="space-y-2">
                      <textarea
                        rows={2}
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                            e.preventDefault();
                            handleSendAgentReply(e);
                          }
                        }}
                        disabled={isSendingReply}
                        placeholder="Type a response as Support Agent... (Ctrl+Enter to send)"
                        className="w-full resize-none rounded-xl border border-zinc-300 bg-zinc-50/50 p-2.5 text-base sm:text-xs text-zinc-900 placeholder:text-zinc-500 focus:border-zinc-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-50/50 dark:text-zinc-900 dark:placeholder:text-zinc-500 dark:focus:bg-white dark:focus:border-zinc-900 dark:focus:ring-zinc-900"
                      />

                      <div className="flex items-center justify-end sm:justify-between">
                        <span className="hidden sm:inline text-[10px] text-zinc-400 dark:text-zinc-500">
                          Press <kbd className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-[9px] dark:bg-zinc-800">Ctrl+Enter</kbd> to send
                        </span>

                        <button
                          type="submit"
                          disabled={!replyText.trim() || isSendingReply}
                          className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-zinc-900 px-3.5 py-2 sm:py-1.5 min-h-[40px] sm:min-h-0 text-xs font-semibold text-white shadow-xs hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
                        >
                          {isSendingReply ? (
                            <>
                              <div className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white dark:border-zinc-900/40 dark:border-t-zinc-900"></div>
                              <span>Sending...</span>
                            </>
                          ) : (
                            <>
                              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                              </svg>
                              <span>Send as Support Agent</span>
                            </>
                          )}
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              </>
            ) : (
              <div className="flex flex-col h-full items-center justify-center p-6 text-center text-xs text-zinc-400 gap-3">
                <button
                  type="button"
                  onClick={() => setMobileShowDetail(false)}
                  aria-label="Back to conversations list"
                  className="inline-flex md:hidden items-center justify-center gap-1 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 shadow-2xs hover:bg-zinc-50 min-h-[40px] dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  <span>Back to conversations</span>
                </button>
                <span>Select a conversation thread to view the message transcript.</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
