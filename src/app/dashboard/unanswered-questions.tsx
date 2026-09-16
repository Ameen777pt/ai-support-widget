"use client";

import { useState, useTransition, useMemo } from "react";
import type { KnowledgeDocumentItem } from "./knowledge-section";
import {
  resolveUnansweredQuestionAction,
  ignoreUnansweredQuestionAction,
  reopenUnansweredQuestionAction,
  type UnansweredQuestionActionState,
} from "@/app/actions/unanswered-questions";
import {
  generateKnowledgeDraftAction,
  publishKnowledgeDraftAction,
  type KnowledgeDraftData,
} from "@/app/actions/draft-knowledge";

export interface UnansweredQuestionItem {
  id: string;
  workspace_id: string;
  question_text: string;
  normalized_query: string;
  occurrence_count: number;
  sample_conversation_id: string | null;
  status: "open" | "resolved" | "ignored";
  resolved_by_document_id: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  first_seen_at: string;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
  resolved_document?: {
    id: string;
    title: string;
  } | null;
}

interface UnansweredQuestionsSectionProps {
  questions: UnansweredQuestionItem[];
  documents: KnowledgeDocumentItem[];
  isReadOnly: boolean;
  onSelectConversation?: (conversationId: string) => void;
}

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function formatTimestamp(dateStr?: string | null): string {
  if (!dateStr) return "";
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

export function UnansweredQuestionsSection({
  questions,
  documents,
  isReadOnly,
  onSelectConversation,
}: UnansweredQuestionsSectionProps) {
  const [filterStatus, setFilterStatus] = useState<"all" | "open" | "resolved" | "ignored">("open");
  const [resolvingQuestion, setResolvingQuestion] = useState<UnansweredQuestionItem | null>(null);
  const [selectedDocId, setSelectedDocId] = useState<string>("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Draft Review & Editor Modal State
  const [generatingQuestionId, setGeneratingQuestionId] = useState<string | null>(null);
  const [draftModalQuestion, setDraftModalQuestion] = useState<UnansweredQuestionItem | null>(null);
  const [activeDraft, setActiveDraft] = useState<KnowledgeDraftData | null>(null);
  const [originalAiDraft, setOriginalAiDraft] = useState<KnowledgeDraftData | null>(null);
  const [editedTitle, setEditedTitle] = useState("");
  const [editedContent, setEditedContent] = useState("");
  const [editorValidationError, setEditorValidationError] = useState<string | null>(null);
  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [confirmedPlaceholders, setConfirmedPlaceholders] = useState(false);
  const [publishSuccessMessage, setPublishSuccessMessage] = useState<string | null>(null);
  const [draftStep, setDraftStep] = useState<"edit" | "publish_preview">("edit");

  // 1. Calculate status counts
  const counts = useMemo(() => {
    return {
      all: questions.length,
      open: questions.filter((q) => q.status === "open").length,
      resolved: questions.filter((q) => q.status === "resolved").length,
      ignored: questions.filter((q) => q.status === "ignored").length,
    };
  }, [questions]);

  // 2. Filter & Sort questions (Open questions sorted by occurrence_count DESC, then last_seen_at DESC)
  const filteredQuestions = useMemo(() => {
    const list = filterStatus === "all" ? [...questions] : questions.filter((q) => q.status === filterStatus);

    return list.sort((a, b) => {
      if (filterStatus === "open" || a.status === "open" || b.status === "open") {
        if (b.occurrence_count !== a.occurrence_count) {
          return b.occurrence_count - a.occurrence_count;
        }
      }
      return new Date(b.last_seen_at).getTime() - new Date(a.last_seen_at).getTime();
    });
  }, [questions, filterStatus]);

  // 3. Handlers
  const handleOpenResolveModal = (question: UnansweredQuestionItem) => {
    setActionError(null);
    setResolvingQuestion(question);
    setSelectedDocId(documents.length > 0 ? documents[0].id : "");
  };

  const handleCloseResolveModal = () => {
    setResolvingQuestion(null);
    setSelectedDocId("");
    setActionError(null);
  };

  const handleConfirmResolve = () => {
    if (!resolvingQuestion || !selectedDocId) return;

    startTransition(async () => {
      const res: UnansweredQuestionActionState = await resolveUnansweredQuestionAction(
        resolvingQuestion.id,
        selectedDocId,
      );

      if (!res.success) {
        setActionError(res.error || "Failed to resolve question.");
      } else {
        handleCloseResolveModal();
      }
    });
  };

  const handleIgnore = (questionId: string) => {
    startTransition(async () => {
      const res: UnansweredQuestionActionState = await ignoreUnansweredQuestionAction(questionId);
      if (!res.success) {
        setActionError(res.error || "Failed to ignore question.");
      }
    });
  };

  const handleReopen = (questionId: string) => {
    startTransition(async () => {
      const res: UnansweredQuestionActionState = await reopenUnansweredQuestionAction(questionId);
      if (!res.success) {
        setActionError(res.error || "Failed to reopen question.");
      }
    });
  };

  const handleViewConversation = (conversationId: string) => {
    if (onSelectConversation) {
      onSelectConversation(conversationId);
    }
    const inboxElement = document.getElementById("conversations-inbox");
    if (inboxElement) {
      inboxElement.scrollIntoView({ behavior: "smooth" });
    }
  };

  // 4. Draft Generation & Editor Handlers
  const remainingPlaceholders = useMemo(() => {
    if (!activeDraft) return [];
    const set = new Set<string>();
    const matches = editedContent.match(/\[Specify\s+[^\]]+\]/gi);
    if (matches) {
      for (const m of matches) set.add(m.trim());
    }
    for (const p of activeDraft.placeholders) {
      if (editedContent.includes(p)) {
        set.add(p);
      }
    }
    return Array.from(set);
  }, [editedContent, activeDraft]);

  const handleStartDraft = (question: UnansweredQuestionItem) => {
    setActionError(null);
    setGeneratingQuestionId(question.id);
    startTransition(async () => {
      try {
        const res = await generateKnowledgeDraftAction(question.id);
        setGeneratingQuestionId(null);
        if (!res.success || !res.draft) {
          setActionError(res.error || "Failed to generate knowledge draft.");
        } else {
          setDraftModalQuestion(question);
          setActiveDraft(res.draft);
          setOriginalAiDraft(res.draft);
          setEditedTitle(res.draft.title);
          setEditedContent(res.draft.content);
          setEditorValidationError(null);
          setShowRegenerateConfirm(false);
          setDraftStep("edit");
        }
      } catch (err) {
        setGeneratingQuestionId(null);
        setActionError(err instanceof Error ? err.message : "Failed to generate draft.");
      }
    });
  };

  const handleCloseDraftModal = () => {
    setDraftModalQuestion(null);
    setActiveDraft(null);
    setOriginalAiDraft(null);
    setEditedTitle("");
    setEditedContent("");
    setEditorValidationError(null);
    setShowRegenerateConfirm(false);
    setIsRegenerating(false);
    setIsPublishing(false);
    setConfirmedPlaceholders(false);
    setDraftStep("edit");
  };

  const handleRegenerateClick = () => {
    if (!draftModalQuestion) return;
    const hasModifications =
      originalAiDraft &&
      (editedTitle.trim() !== originalAiDraft.title.trim() ||
        editedContent.trim() !== originalAiDraft.content.trim());

    if (hasModifications) {
      setShowRegenerateConfirm(true);
    } else {
      executeRegenerate();
    }
  };

  const executeRegenerate = () => {
    if (!draftModalQuestion) return;
    setIsRegenerating(true);
    setShowRegenerateConfirm(false);
    setEditorValidationError(null);
    startTransition(async () => {
      try {
        const res = await generateKnowledgeDraftAction(draftModalQuestion.id);
        setIsRegenerating(false);
        if (!res.success || !res.draft) {
          setEditorValidationError(res.error || "Failed to regenerate draft.");
        } else {
          setActiveDraft(res.draft);
          setOriginalAiDraft(res.draft);
          setEditedTitle(res.draft.title);
          setEditedContent(res.draft.content);
          setEditorValidationError(null);
          setDraftStep("edit");
        }
      } catch (err) {
        setIsRegenerating(false);
        setEditorValidationError(
          err instanceof Error ? err.message : "Failed to regenerate draft.",
        );
      }
    });
  };

  const handleContinueToPublish = () => {
    setEditorValidationError(null);
    const trimmedTitle = editedTitle.trim();
    const trimmedContent = editedContent.trim();

    // Validate Title (matching knowledge document rules: 2-150 chars)
    if (!trimmedTitle || trimmedTitle.length < 2 || trimmedTitle.length > 150) {
      setEditorValidationError("Title must be between 2 and 150 characters.");
      return;
    }

    // Validate Content (matching knowledge document rules: 10-20,000 chars)
    if (!trimmedContent || trimmedContent.length < 10 || trimmedContent.length > 20000) {
      setEditorValidationError("Content must be between 10 and 20,000 characters.");
      return;
    }

    // Transition to publish review UI state - strictly read-only, zero database mutations
    setDraftStep("publish_preview");
  };

  const handleExecutePublish = () => {
    if (!draftModalQuestion || isPublishing) return;
    setEditorValidationError(null);

    // Explicit confirmation guard for unresolved placeholders
    if (remainingPlaceholders.length > 0 && !confirmedPlaceholders) {
      setEditorValidationError(
        `This draft contains ${remainingPlaceholders.length} unpopulated placeholder(s). Please check the confirmation box above to acknowledge publishing with placeholders, or return to editing.`,
      );
      return;
    }

    setIsPublishing(true);
    startTransition(async () => {
      try {
        const res = await publishKnowledgeDraftAction({
          questionId: draftModalQuestion.id,
          title: editedTitle,
          content: editedContent,
          allowPlaceholders: confirmedPlaceholders,
        });

        setIsPublishing(false);

        if (!res.success) {
          setEditorValidationError(
            res.error || "Failed to publish knowledge draft.",
          );
        } else {
          setPublishSuccessMessage(
            "Knowledge article published successfully and gap resolved!",
          );
          handleCloseDraftModal();
        }
      } catch (err) {
        setIsPublishing(false);
        setEditorValidationError(
          err instanceof Error
            ? err.message
            : "Failed to publish knowledge draft.",
        );
      }
    });
  };

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Unanswered Questions & Knowledge Gaps
            </h2>
            {counts.open > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-950/80 dark:text-amber-300">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                {counts.open} Open {counts.open === 1 ? "Gap" : "Gaps"}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Visitor questions that could not be answered from existing documentation. Resolve them by linking knowledge articles.
          </p>
        </div>

        {/* Status Filter Tabs */}
        <div className="flex flex-wrap items-center gap-1 rounded-xl bg-zinc-100 p-1 dark:bg-zinc-800/80">
          {(
            [
              { key: "open", label: "Open Gaps", count: counts.open },
              { key: "all", label: "All", count: counts.all },
              { key: "resolved", label: "Resolved", count: counts.resolved },
              { key: "ignored", label: "Ignored", count: counts.ignored },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilterStatus(tab.key)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                filterStatus === tab.key
                  ? "bg-white text-zinc-900 shadow-xs dark:bg-zinc-700 dark:text-zinc-100"
                  : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`rounded-full px-1.5 py-0.2 text-[10px] font-semibold ${
                  filterStatus === tab.key
                    ? "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200"
                    : "bg-zinc-200/70 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                }`}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Global Error Banner */}
      {actionError && (
        <div className="mt-4 flex items-center justify-between rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-300">
          <span>{actionError}</span>
          <button
            onClick={() => setActionError(null)}
            className="text-red-600 hover:text-red-800 dark:text-red-400"
          >
            ✕
          </button>
        </div>
      )}

      {/* Global Publish Success Banner */}
      {publishSuccessMessage && (
        <div className="mt-4 flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/50 dark:text-emerald-300">
          <div className="flex items-center gap-2">
            <span>✓</span>
            <span>{publishSuccessMessage}</span>
          </div>
          <button
            onClick={() => setPublishSuccessMessage(null)}
            className="text-emerald-600 hover:text-emerald-800 dark:text-emerald-400"
          >
            ✕
          </button>
        </div>
      )}

      {/* Question Items List */}
      <div className="mt-6 divide-y divide-zinc-100 dark:divide-zinc-800">
        {filteredQuestions.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-200 py-12 text-center dark:border-zinc-800">
            <svg
              className="h-10 w-10 text-zinc-300 dark:text-zinc-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <p className="mt-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
              No unanswered questions in this category
            </p>
            <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500 max-w-sm">
              {filterStatus === "open"
                ? "Great news! The AI currently has sufficient knowledge to answer customer queries."
                : "Questions will appear here as they are detected or updated."}
            </p>
          </div>
        ) : (
          filteredQuestions.map((q) => {
            const isFrequent = q.occurrence_count >= 3;
            const resolvedDoc = q.resolved_document;

            return (
              <div
                key={q.id}
                className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="space-y-1.5 flex-1 pr-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                      &ldquo;{q.question_text}&rdquo;
                    </span>

                    {/* Occurrence Pill */}
                    <span
                      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                        isFrequent
                          ? "bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-900/40"
                          : "bg-zinc-100 text-zinc-700 border border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700"
                      }`}
                    >
                      {isFrequent && <span>🔥</span>}
                      {q.occurrence_count === 1 ? "Asked 1 time" : `Asked ${q.occurrence_count} times`}
                    </span>

                    {/* Status Pill */}
                    <span
                      className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                        q.status === "open"
                          ? "bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-900/40"
                          : q.status === "resolved"
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900/40"
                          : "bg-zinc-100 text-zinc-500 border border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700"
                      }`}
                    >
                      {q.status}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-400 dark:text-zinc-500">
                    <span>Last seen: {formatTimestamp(q.last_seen_at)}</span>
                    {q.first_seen_at !== q.last_seen_at && (
                      <>
                        <span>•</span>
                        <span>First seen: {formatTimestamp(q.first_seen_at)}</span>
                      </>
                    )}

                    {/* Linked Resolution Doc */}
                    {q.status === "resolved" && resolvedDoc && (
                      <>
                        <span>•</span>
                        <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                          <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          Resolved by: {resolvedDoc.title}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  {/* View Sample Conversation */}
                  {q.sample_conversation_id && (
                    <button
                      onClick={() => handleViewConversation(q.sample_conversation_id!)}
                      title="Inspect sample visitor conversation"
                      className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 shadow-2xs hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                    >
                      View Chat
                    </button>
                  )}

                  {!isReadOnly && (
                    <>
                      {q.status === "open" && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleStartDraft(q)}
                            disabled={isPending || generatingQuestionId !== null}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white shadow-2xs hover:bg-indigo-700 active:scale-95 disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-600"
                          >
                            {generatingQuestionId === q.id ? (
                              <>
                                <div className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                                <span>Drafting with AI...</span>
                              </>
                            ) : (
                              <>
                                <svg
                                  className="h-3.5 w-3.5"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M13 10V3L4 14h7v7l9-11h-7z"
                                  />
                                </svg>
                                <span>Draft Doc with AI</span>
                              </>
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenResolveModal(q)}
                            disabled={isPending || generatingQuestionId !== null}
                            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white shadow-2xs hover:bg-emerald-700 active:scale-95 disabled:opacity-50 dark:bg-emerald-500 dark:hover:bg-emerald-600"
                          >
                            Resolve with Knowledge
                          </button>
                          <button
                            type="button"
                            onClick={() => handleIgnore(q.id)}
                            disabled={isPending || generatingQuestionId !== null}
                            title="Dismiss one-off or irrelevant query"
                            className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-500 shadow-2xs hover:bg-zinc-50 hover:text-zinc-700 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
                          >
                            Ignore
                          </button>
                        </>
                      )}

                      {(q.status === "resolved" || q.status === "ignored") && (
                        <button
                          onClick={() => handleReopen(q.id)}
                          disabled={isPending}
                          className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-2xs hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                        >
                          Reopen Gap
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Resolve with Knowledge Document Modal */}
      {resolvingQuestion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900">
            <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              Resolve Knowledge Gap
            </h3>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Select the workspace knowledge article that answers this customer question.
            </p>

            <div className="mt-4 rounded-xl bg-zinc-50 p-3 border border-zinc-200/80 dark:bg-zinc-800/60 dark:border-zinc-700">
              <span className="text-[10px] font-semibold uppercase text-zinc-400 dark:text-zinc-500">
                Question
              </span>
              <p className="mt-0.5 text-xs font-medium text-zinc-900 dark:text-zinc-100">
                &ldquo;{resolvingQuestion.question_text}&rdquo;
              </p>
            </div>

            <div className="mt-4 space-y-2">
              <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Choose Knowledge Document
              </label>
              {documents.length === 0 ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/60 dark:text-amber-300">
                  No knowledge documents found in this workspace. Please add a document to your Knowledge Base first.
                </div>
              ) : (
                <select
                  value={selectedDocId}
                  onChange={(e) => setSelectedDocId(e.target.value)}
                  className="w-full rounded-xl border border-zinc-300 bg-white px-3.5 py-2 text-xs text-zinc-900 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                >
                  {documents.map((doc) => (
                    <option key={doc.id} value={doc.id}>
                      {doc.title} ({doc.status})
                    </option>
                  ))}
                </select>
              )}
            </div>

            {actionError && (
              <p className="mt-3 text-xs font-medium text-red-600 dark:text-red-400">
                {actionError}
              </p>
            )}

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={handleCloseResolveModal}
                disabled={isPending}
                className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmResolve}
                disabled={isPending || documents.length === 0 || !selectedDocId}
                className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-medium text-white shadow-xs hover:bg-emerald-700 active:scale-95 disabled:opacity-50 dark:bg-emerald-500 dark:hover:bg-emerald-600"
              >
                {isPending && (
                  <div className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white"></div>
                )}
                <span>Link &amp; Mark Resolved</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Knowledge Draft Review & Editor Modal */}
      {draftModalQuestion && activeDraft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs overflow-y-auto">
          <div className="my-8 w-full max-w-3xl rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900 max-h-[90vh] overflow-y-auto">
            {draftStep === "edit" ? (
              <>
                {/* Modal Header */}
                <div className="flex items-center justify-between border-b border-zinc-100 pb-4 dark:border-zinc-800">
                  <div className="flex items-center gap-2.5">
                    <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                      AI Knowledge Draft Review
                    </h3>
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800 border border-amber-200 dark:bg-amber-950/80 dark:text-amber-300 dark:border-amber-800/60">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                      Human Review Required
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleCloseDraftModal}
                    className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                    title="Close draft editor"
                  >
                    ✕
                  </button>
                </div>

                {/* Review Warning Notice */}
                <div className="mt-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
                  <span className="text-lg leading-none">⚠️</span>
                  <div>
                    <span className="font-semibold text-amber-950 dark:text-amber-100">
                      AI Draft Notice:
                    </span>
                    <p className="mt-0.5 text-amber-800 dark:text-amber-300 leading-relaxed">
                      This article was generated by AI based on the customer query and available workspace context. It is an editable draft and must be reviewed, fact-checked, and completed before publishing.
                    </p>
                  </div>
                </div>

                {/* Question & AI Summary */}
                <div className="mt-4 rounded-xl border border-zinc-200/80 bg-zinc-50 p-3.5 dark:border-zinc-700 dark:bg-zinc-800/60">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                    Source Customer Query (Knowledge Gap)
                  </span>
                  <p className="mt-0.5 text-xs font-medium text-zinc-900 dark:text-zinc-100">
                    &ldquo;{draftModalQuestion.question_text}&rdquo;
                  </p>

                  {activeDraft.summary && (
                    <div className="mt-2.5 border-t border-zinc-200/60 pt-2 dark:border-zinc-700/60">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                        AI Draft Summary
                      </span>
                      <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                        {activeDraft.summary}
                      </p>
                    </div>
                  )}
                </div>

                {/* Missing Information Placeholders Indicator */}
                <div className="mt-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
                      <span>Missing Information Placeholders</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          remainingPlaceholders.length > 0
                            ? "bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800"
                            : "bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800"
                        }`}
                      >
                        {remainingPlaceholders.length === 0
                          ? "All resolved"
                          : `${remainingPlaceholders.length} remaining`}
                      </span>
                    </label>
                  </div>

                  {activeDraft.placeholders.length > 0 ? (
                    <div className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-3 dark:border-zinc-700 dark:bg-zinc-800/40">
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                        The AI inserted bracketed tags for missing company facts. Replace them in the editor below:
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {activeDraft.placeholders.map((ph, idx) => {
                          const isStillPresent = remainingPlaceholders.includes(ph);
                          return (
                            <span
                              key={idx}
                              className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-mono text-[11px] transition-colors ${
                                isStillPresent
                                  ? "bg-amber-100/90 font-semibold text-amber-900 border border-amber-300 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-800"
                                  : "bg-zinc-200/70 text-zinc-500 line-through dark:bg-zinc-800 dark:text-zinc-500"
                              }`}
                            >
                              <span>{isStillPresent ? "●" : "✓"}</span>
                              <span>{ph}</span>
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-zinc-400 italic">No explicit placeholders flagged by AI.</p>
                  )}
                </div>

                {/* Editable Title Input */}
                <div className="mt-4">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                      Document Title
                    </label>
                    <span
                      className={`text-[11px] ${
                        editedTitle.trim().length < 2 || editedTitle.trim().length > 150
                          ? "font-semibold text-amber-600 dark:text-amber-400"
                          : "text-zinc-400"
                      }`}
                    >
                      {editedTitle.length}/150
                    </span>
                  </div>
                  <input
                    type="text"
                    value={editedTitle}
                    onChange={(e) => setEditedTitle(e.target.value)}
                    disabled={isRegenerating || isPending}
                    className="mt-1.5 block w-full rounded-xl border border-zinc-300 bg-white px-3.5 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:border-zinc-400"
                    placeholder="Enter document title (2 - 150 characters)..."
                  />
                </div>

                {/* Editable Content Textarea */}
                <div className="mt-4">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                      Knowledge Content (Markdown)
                    </label>
                    <span
                      className={`text-[11px] ${
                        editedContent.trim().length < 10 || editedContent.trim().length > 20000
                          ? "font-semibold text-amber-600 dark:text-amber-400"
                          : "text-zinc-400"
                      }`}
                    >
                      {editedContent.length}/20,000
                    </span>
                  </div>
                  <textarea
                    rows={12}
                    value={editedContent}
                    onChange={(e) => setEditedContent(e.target.value)}
                    disabled={isRegenerating || isPending}
                    className="mt-1.5 block w-full font-mono rounded-xl border border-zinc-300 bg-white p-3.5 text-xs leading-relaxed text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:border-zinc-400"
                    placeholder="Edit knowledge article content..."
                  />
                  <p className="mt-1 text-[11px] text-zinc-400 dark:text-zinc-500">
                    Feel free to completely rewrite or expand this draft. Keep or replace placeholders as needed.
                  </p>
                </div>

                {/* Validation Error Display */}
                {editorValidationError && (
                  <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-300">
                    {editorValidationError}
                  </div>
                )}

                {/* Regeneration Warning Prompt */}
                {showRegenerateConfirm && (
                  <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3.5 text-xs text-amber-950 dark:border-amber-800 dark:bg-amber-950/80 dark:text-amber-200">
                    <p className="font-semibold">Regenerate and replace edits?</p>
                    <p className="mt-0.5 text-[11px] text-amber-800 dark:text-amber-300">
                      You have modified the draft title or content. Regenerating with AI will discard your current edits and generate a fresh draft.
                    </p>
                    <div className="mt-3 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={executeRegenerate}
                        disabled={isRegenerating || isPending}
                        className="rounded-lg bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-amber-800"
                      >
                        Yes, Discard Edits &amp; Regenerate
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowRegenerateConfirm(false)}
                        className="rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                      >
                        Keep My Edits
                      </button>
                    </div>
                  </div>
                )}

                {/* Modal Footer Actions */}
                <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between border-t border-zinc-100 pt-4 dark:border-zinc-800">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleCloseDraftModal}
                      disabled={isRegenerating || isPending}
                      className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleRegenerateClick}
                      disabled={isRegenerating || isPending}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-300 bg-white px-3.5 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                    >
                      {isRegenerating ? (
                        <>
                          <div className="h-3 w-3 animate-spin rounded-full border-2 border-zinc-400 border-t-zinc-800" />
                          <span>Regenerating...</span>
                        </>
                      ) : (
                        <>
                          <svg
                            className="h-3.5 w-3.5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                            />
                          </svg>
                          <span>Regenerate Draft</span>
                        </>
                      )}
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={handleContinueToPublish}
                    disabled={isRegenerating || isPending}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-indigo-700 active:scale-95 disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-600"
                  >
                    <span>Continue to Publish</span>
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
              </>
            ) : (
              /* Publish Preview Step */
              <>
                {/* Modal Header */}
                <div className="flex items-center justify-between border-b border-zinc-100 pb-4 dark:border-zinc-800">
                  <div className="flex items-center gap-2.5">
                    <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                      Knowledge Draft: Publish Preview
                    </h3>
                    <span className="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700 border border-indigo-200 dark:bg-indigo-950/80 dark:text-indigo-300 dark:border-indigo-800">
                      Ready for Publishing Review
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleCloseDraftModal}
                    className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                    title="Close preview"
                  >
                    ✕
                  </button>
                </div>

                {/* Notice that no changes were made */}
                <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50/80 p-3.5 text-xs text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/50 dark:text-blue-200">
                  <span className="font-semibold text-blue-950 dark:text-blue-100">
                    Draft Validated &amp; Ready:
                  </span>
                  <p className="mt-0.5 text-blue-800 dark:text-blue-300 leading-relaxed">
                    The document title and content have passed all validation rules. Note: Final database publishing and knowledge-gap resolution will occur in Step 6.4-C. No database changes have been made.
                  </p>
                </div>

                {/* Overview Card */}
                <div className="mt-4 space-y-2 rounded-xl border border-zinc-200 bg-zinc-50/60 p-4 dark:border-zinc-700 dark:bg-zinc-800/40">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                      Title
                    </span>
                    <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                      {editedTitle}
                    </span>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 border-t border-zinc-200/60 pt-2 dark:border-zinc-700/60">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                      Resolves Gap
                    </span>
                    <span className="text-xs text-zinc-700 dark:text-zinc-300">
                      &ldquo;{draftModalQuestion.question_text}&rdquo;
                    </span>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 border-t border-zinc-200/60 pt-2 dark:border-zinc-700/60">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                      Article Size
                    </span>
                    <span className="text-xs font-mono text-zinc-600 dark:text-zinc-400">
                      {editedContent.length} characters (~{Math.round(editedContent.length / 4)} tokens)
                    </span>
                  </div>
                </div>

                {/* Remaining Placeholders Warning or Success */}
                {remainingPlaceholders.length > 0 ? (
                  <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300">
                    <p className="font-semibold">⚠️ Unresolved Placeholders Remaining:</p>
                    <p className="mt-0.5 text-[11px] text-amber-800 dark:text-amber-300">
                      The draft still contains {remainingPlaceholders.length} placeholder tag(s): {remainingPlaceholders.join(", ")}. You can return to editing to fill them in before publishing.
                    </p>
                    <div className="mt-2.5 flex items-start gap-2 pt-2 border-t border-amber-200/80 dark:border-amber-800/60">
                      <input
                        type="checkbox"
                        id="confirm_placeholders"
                        checked={confirmedPlaceholders}
                        onChange={(e) => {
                          setConfirmedPlaceholders(e.target.checked);
                          if (e.target.checked) setEditorValidationError(null);
                        }}
                        disabled={isPublishing}
                        className="mt-0.5 h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500 dark:border-amber-700 dark:bg-zinc-800"
                      />
                      <label
                        htmlFor="confirm_placeholders"
                        className="text-xs font-medium text-amber-900 dark:text-amber-200 cursor-pointer"
                      >
                        I acknowledge that this draft contains {remainingPlaceholders.length} unresolved placeholder(s) and explicitly confirm publishing it as-is.
                      </label>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300">
                    ✓ All detected placeholders have been resolved.
                  </div>
                )}

                {/* Content Preview Box */}
                <div className="mt-4">
                  <span className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1.5">
                    Formatted Content Preview
                  </span>
                  <div className="rounded-xl border border-zinc-200 bg-white p-4 font-mono text-xs leading-relaxed text-zinc-800 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 max-h-60 overflow-y-auto whitespace-pre-wrap">
                    {editedContent}
                  </div>
                </div>

                {/* Validation / Action Error Display in Preview */}
                {editorValidationError && (
                  <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-300">
                    {editorValidationError}
                  </div>
                )}

                {/* Preview Actions */}
                <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between border-t border-zinc-100 pt-4 dark:border-zinc-800">
                  <button
                    type="button"
                    onClick={() => setDraftStep("edit")}
                    disabled={isPublishing}
                    className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                  >
                    ← Back to Editor
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleCloseDraftModal}
                      disabled={isPublishing}
                      className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleExecutePublish}
                      disabled={
                        isPublishing ||
                        (remainingPlaceholders.length > 0 && !confirmedPlaceholders)
                      }
                      className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 active:scale-95 disabled:opacity-50 dark:bg-emerald-500 dark:hover:bg-emerald-600"
                    >
                      {isPublishing ? (
                        <>
                          <div className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                          <span>Publishing &amp; Resolving Gap...</span>
                        </>
                      ) : (
                        <>
                          <svg
                            className="h-3.5 w-3.5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                          <span>Publish &amp; Resolve Gap</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

