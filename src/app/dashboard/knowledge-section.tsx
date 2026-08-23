"use client";

import { useState, useTransition } from "react";
import {
  createKnowledgeDocAction,
  updateKnowledgeDocAction,
  deleteKnowledgeDocAction,
  type KnowledgeActionState,
} from "@/app/actions/knowledge";

export interface KnowledgeDocumentItem {
  id: string;
  title: string;
  content: string;
  source_type: string;
  status: string;
  file_size_bytes: number | null;
  created_at: string;
  updated_at: string;
}

interface KnowledgeSectionProps {
  documents: KnowledgeDocumentItem[];
  isReadOnly: boolean;
}

export function KnowledgeSection({
  documents,
  isReadOnly,
}: KnowledgeSectionProps) {
  const [activeMode, setActiveMode] = useState<"idle" | "create" | "edit">("idle");
  const [editingDoc, setEditingDoc] = useState<KnowledgeDocumentItem | null>(null);
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);
  const [expandedDocId, setExpandedDocId] = useState<string | null>(null);

  // Form inputs
  const [titleInput, setTitleInput] = useState("");
  const [contentInput, setContentInput] = useState("");

  // Action states
  const [feedback, setFeedback] = useState<KnowledgeActionState | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleOpenCreate = () => {
    setFeedback(null);
    setEditingDoc(null);
    setTitleInput("");
    setContentInput("");
    setActiveMode("create");
  };

  const handleOpenEdit = (doc: KnowledgeDocumentItem) => {
    setFeedback(null);
    setEditingDoc(doc);
    setTitleInput(doc.title);
    setContentInput(doc.content);
    setActiveMode("edit");
  };

  const handleCancelForm = () => {
    setActiveMode("idle");
    setEditingDoc(null);
    setTitleInput("");
    setContentInput("");
  };

  const handleCreateSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await createKnowledgeDocAction({ error: null }, formData);
      setFeedback(res);
      if (res.success) {
        setActiveMode("idle");
        setTitleInput("");
        setContentInput("");
      }
    });
  };

  const handleUpdateSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await updateKnowledgeDocAction({ error: null }, formData);
      setFeedback(res);
      if (res.success) {
        setActiveMode("idle");
        setEditingDoc(null);
        setTitleInput("");
        setContentInput("");
      }
    });
  };

  const handleDeleteSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await deleteKnowledgeDocAction({ error: null }, formData);
      setFeedback(res);
      if (res.success) {
        setDeletingDocId(null);
      }
    });
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return "0 B";
    if (bytes < 1024) return `${bytes} B`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  };

  const MONTH_NAMES = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];

  const formatDate = (dateStr: string): string => {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;

    const month = MONTH_NAMES[d.getUTCMonth()];
    const day = d.getUTCDate();
    const year = d.getUTCFullYear();

    return `${month} ${day}, ${year}`;
  };

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      {/* Section Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Workspace Knowledge Base
            </h2>
            <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              {documents.length} {documents.length === 1 ? "entry" : "entries"}
            </span>
          </div>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Provide FAQs, return policies, product specifications, and documentation for your workspace.
          </p>
        </div>

        {!isReadOnly && activeMode === "idle" && (
          <button
            type="button"
            onClick={handleOpenCreate}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white shadow-xs hover:bg-zinc-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span>Add Knowledge Entry</span>
          </button>
        )}
      </div>

      {/* Member Read-Only Banner */}
      {isReadOnly && (
        <div
          role="alert"
          className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300"
        >
          You are viewing this workspace as a <strong>Member</strong>. Knowledge entries are read-only. Only workspace <strong>Owners</strong> and <strong>Admins</strong> can create, edit, or delete entries.
        </div>
      )}

      {/* Global Action Feedback Message */}
      {feedback?.message && (
        <div
          role="status"
          className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/50 dark:text-emerald-300"
        >
          {feedback.message}
        </div>
      )}

      {/* Inline Create / Edit Form */}
      {activeMode !== "idle" && (
        <div className="mt-6 rounded-2xl border border-zinc-300 bg-zinc-50/50 p-5 dark:border-zinc-700 dark:bg-zinc-800/40">
          <div className="flex items-center justify-between border-b border-zinc-200 pb-3 dark:border-zinc-700">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {activeMode === "create" ? "New Knowledge Entry" : `Edit Knowledge Entry: ${editingDoc?.title}`}
            </h3>
            <button
              type="button"
              onClick={handleCancelForm}
              className="text-xs text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
            >
              Cancel
            </button>
          </div>

          <form
            onSubmit={activeMode === "create" ? handleCreateSubmit : handleUpdateSubmit}
            className="mt-4 space-y-4"
          >
            {activeMode === "edit" && editingDoc && (
              <input type="hidden" name="document_id" value={editingDoc.id} />
            )}

            {/* Error Display */}
            {feedback?.error && (
              <div
                role="alert"
                className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-300"
              >
                {feedback.error}
              </div>
            )}

            {/* Title Input */}
            <div>
              <div className="flex items-center justify-between">
                <label
                  htmlFor="knowledge_title"
                  className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400"
                >
                  Document Title
                </label>
                <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
                  {titleInput.length}/150
                </span>
              </div>
              <input
                id="knowledge_title"
                name="title"
                type="text"
                required
                minLength={2}
                maxLength={150}
                value={titleInput}
                onChange={(e) => setTitleInput(e.target.value)}
                disabled={isPending}
                className="mt-1.5 block w-full rounded-xl border border-zinc-300 bg-white px-3.5 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 disabled:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-zinc-400 dark:disabled:bg-zinc-800/50"
                placeholder="e.g. Return & Exchange Policy, Operating Hours, API Specs"
              />
            </div>

            {/* Content Textarea */}
            <div>
              <div className="flex items-center justify-between">
                <label
                  htmlFor="knowledge_content"
                  className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400"
                >
                  Knowledge Content
                </label>
                <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
                  {contentInput.length}/20,000
                </span>
              </div>
              <textarea
                id="knowledge_content"
                name="content"
                required
                rows={8}
                minLength={10}
                maxLength={20000}
                value={contentInput}
                onChange={(e) => setContentInput(e.target.value)}
                disabled={isPending}
                className="mt-1.5 block w-full rounded-xl border border-zinc-300 bg-white px-3.5 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 disabled:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-zinc-400 dark:disabled:bg-zinc-800/50"
                placeholder="Enter clear, comprehensive knowledge text or FAQ questions and answers here..."
              />
              <p className="mt-1 text-[11px] text-zinc-400 dark:text-zinc-500">
                Minimum 10 characters. Plain text or markdown formatted content.
              </p>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 pt-2">
              <button
                type="submit"
                disabled={isPending}
                className="inline-flex justify-center rounded-xl bg-zinc-900 px-5 py-2 text-sm font-semibold text-white shadow-xs hover:bg-zinc-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                {activeMode === "create"
                  ? isPending
                    ? "Saving entry..."
                    : "Save Knowledge Entry"
                  : isPending
                  ? "Updating entry..."
                  : "Update Knowledge Entry"}
              </button>

              <button
                type="button"
                onClick={handleCancelForm}
                disabled={isPending}
                className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 shadow-2xs hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Delete Confirmation Banner */}
      {deletingDocId && (
        <div className="mt-6 rounded-2xl border border-red-200 bg-red-50/70 p-5 dark:border-red-900/60 dark:bg-red-950/40">
          <h4 className="text-sm font-semibold text-red-900 dark:text-red-200">
            Confirm Document Deletion
          </h4>
          <p className="mt-1 text-xs text-red-700 dark:text-red-300">
            Are you sure you want to delete this knowledge entry? This action cannot be undone.
          </p>

          {feedback?.error && (
            <div
              role="alert"
              className="mt-3 rounded-lg border border-red-300 bg-white p-2.5 text-xs text-red-800 dark:border-red-800 dark:bg-zinc-900 dark:text-red-300"
            >
              {feedback.error}
            </div>
          )}

          <form onSubmit={handleDeleteSubmit} className="mt-4 flex items-center gap-3">
            <input type="hidden" name="document_id" value={deletingDocId} />
            <button
              type="submit"
              disabled={isPending}
              className="rounded-xl bg-red-600 px-4 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-red-700 disabled:opacity-60"
            >
              {isPending ? "Deleting..." : "Yes, Delete Document"}
            </button>
            <button
              type="button"
              onClick={() => setDeletingDocId(null)}
              disabled={isPending}
              className="rounded-xl border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-2xs hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
            >
              Cancel
            </button>
          </form>
        </div>
      )}

      {/* Documents List */}
      <div className="mt-6 space-y-4">
        {documents.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300 p-8 text-center dark:border-zinc-700">
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
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <h4 className="mt-3 text-sm font-semibold text-zinc-800 dark:text-zinc-200">
              No knowledge entries yet
            </h4>
            <p className="mt-1 max-w-sm text-xs text-zinc-500 dark:text-zinc-400">
              Add FAQs, company policies, or product information so your workspace is prepared to deliver accurate support.
            </p>
            {!isReadOnly && (
              <button
                type="button"
                onClick={handleOpenCreate}
                className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-zinc-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-zinc-700 shadow-2xs hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span>Add Your First Entry</span>
              </button>
            )}
          </div>
        ) : (
          documents.map((doc) => {
            const isExpanded = expandedDocId === doc.id;
            return (
              <div
                key={doc.id}
                className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-xs transition-colors hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900/90 dark:hover:border-zinc-700"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                        {doc.title}
                      </h4>
                      <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 ring-1 ring-emerald-600/20 ring-inset dark:bg-emerald-950/50 dark:text-emerald-300">
                        {doc.status}
                      </span>
                      <span className="inline-flex items-center rounded-md bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                        {doc.source_type}
                      </span>
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-zinc-400 dark:text-zinc-500">
                      <span>Size: {formatFileSize(doc.file_size_bytes)}</span>
                      <span>•</span>
                      <span>
                        Created: {formatDate(doc.created_at)}
                      </span>
                      {doc.updated_at && doc.updated_at !== doc.created_at && (
                        <>
                          <span>•</span>
                          <span>
                            Updated: {formatDate(doc.updated_at)}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Actions for Owner/Admin */}
                  {!isReadOnly && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(doc)}
                        className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 shadow-2xs hover:bg-zinc-50 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeletingDocId(doc.id)}
                        className="rounded-lg border border-red-200 bg-white px-2.5 py-1 text-xs font-medium text-red-600 shadow-2xs hover:bg-red-50 hover:text-red-700 dark:border-red-900/60 dark:bg-zinc-800 dark:text-red-400 dark:hover:bg-red-950/40"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>

                {/* Content Preview */}
                <div className="mt-3 text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">
                  <p className="whitespace-pre-wrap">
                    {isExpanded
                      ? doc.content
                      : doc.content.length > 220
                      ? `${doc.content.slice(0, 220)}...`
                      : doc.content}
                  </p>
                  {doc.content.length > 220 && (
                    <button
                      type="button"
                      onClick={() => setExpandedDocId(isExpanded ? null : doc.id)}
                      className="mt-1 font-medium text-zinc-900 underline underline-offset-2 hover:text-zinc-700 dark:text-zinc-100 dark:hover:text-zinc-300"
                    >
                      {isExpanded ? "Show less" : "Read full content"}
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
