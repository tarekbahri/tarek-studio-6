import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Copy,
  Download,
  FilePlus2,
  FolderOpen,
  FolderUp,
  Pencil,
  Trash2,
  X,
} from 'lucide-react';
import { getSavedProjectSnapshot } from '../audio/projectStorage';
import type { TarekProject, TarekProjectSummary } from '../types/beatbox';

interface MyProjectsModalProps {
  open: boolean;
  projects: TarekProjectSummary[];
  activeProjectId: string;
  onClose: () => void;
  onCreateNewProject: (customName?: string) => void;
  onSelectProject: (id: string) => void;
  onRenameProject: (id: string, nextName: string) => void;
  onDuplicateProject: (id: string) => void;
  onDeleteProject: (id: string) => void;
  onImportProject: (raw: Partial<TarekProject>) => void;
}

function formatUpdatedTime(ts: number): string {
  if (!Number.isFinite(ts) || ts <= 0) return 'Saved';
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 15) return 'Saved just now';
  if (diffSec < 60) return `Saved ${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `Saved ${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `Saved ${diffHr}h ago`;
  try {
    return new Date(ts).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return 'Saved';
  }
}

export const MyProjectsModal: React.FC<MyProjectsModalProps> = ({
  open,
  projects,
  activeProjectId,
  onClose,
  onCreateNewProject,
  onSelectProject,
  onRenameProject,
  onDuplicateProject,
  onDeleteProject,
  onImportProject,
}) => {
  const [newProjectName, setNewProjectName] = useState<string>('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState<string>('');
  const [confirmDeleteTarget, setConfirmDeleteTarget] =
    useState<TarekProjectSummary | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const renameInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) {
      setRenamingId(null);
      setRenameDraft('');
      setConfirmDeleteTarget(null);
      setImportError(null);
    }
  }, [open]);

  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingId]);

  if (!open) return null;

  const handleCreate = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    onCreateNewProject(newProjectName.trim() || undefined);
    setNewProjectName('');
    setConfirmDeleteTarget(null);
    setRenamingId(null);
  };

  const startRename = (proj: TarekProjectSummary) => {
    setConfirmDeleteTarget(null);
    setRenamingId(proj.id);
    setRenameDraft(proj.name);
  };

  const commitRename = (id: string) => {
    const trimmed = renameDraft.trim();
    if (trimmed) {
      onRenameProject(id, trimmed);
    }
    setRenamingId(null);
    setRenameDraft('');
  };

  const cancelRename = () => {
    setRenamingId(null);
    setRenameDraft('');
  };

  const handleExportProject = (proj: TarekProjectSummary) => {
    const snap = getSavedProjectSnapshot(proj.id);
    if (!snap) return;
    const json = JSON.stringify(snap, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(snap.name || 'tarek-project').replace(/[^a-z0-9_-]+/gi, '_')}.tarek.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError(null);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as Partial<TarekProject>;
        if (!parsed || typeof parsed !== 'object') {
          setImportError('Invalid TAREK project JSON file.');
          return;
        }
        onImportProject(parsed);
      } catch {
        setImportError('Could not read file. Please choose a valid .tarek.json export.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="My Projects"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-2 sm:p-4"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget && !confirmDeleteTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-3xl max-h-[90dvh] flex flex-col rounded-2xl border border-[#2A374E] bg-[#0D121C] shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 sm:px-4 py-2.5 bg-[#121926] border-b border-[#253147] shrink-0">
          <div className="flex items-center gap-2.5">
            <FolderOpen className="w-4 h-4 text-emerald-400 shrink-0" />
            <h2 className="font-display text-sm sm:text-base font-bold text-white tracking-wide">
              MY PROJECTS
            </h2>
            <span className="font-mono-num text-[11px] px-2 py-0.5 rounded bg-[#080B12] border border-[#243045] text-emerald-300 whitespace-nowrap">
              {projects.length} {projects.length === 1 ? 'Saved' : 'Saved'}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              style={{ touchAction: 'manipulation' }}
              className="inline-flex items-center gap-1.5 px-2.5 h-8 rounded-lg bg-[#090D16] hover:bg-[#172133] border border-[#2A374E] text-xs font-medium text-slate-200 hover:text-amber-300 cursor-pointer whitespace-nowrap"
            >
              <FolderUp className="w-3.5 h-3.5 text-amber-300" />
              <span>Import JSON</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.tarek.json,application/json"
              className="hidden"
              onChange={handleImportFile}
            />
            <button
              type="button"
              onClick={onClose}
              aria-label="Close My Projects"
              style={{ touchAction: 'manipulation' }}
              className="w-8 h-8 rounded-lg bg-[#080B12] border border-[#2A374E] flex items-center justify-center text-slate-300 hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Create New Separate Project Strip */}
        <form
          onSubmit={handleCreate}
          className="flex flex-wrap sm:flex-nowrap items-center gap-2 px-3 sm:px-4 py-2.5 bg-[#0A0E16] border-b border-[#1E2738] shrink-0"
        >
          <input
            aria-label="New project name"
            type="text"
            value={newProjectName}
            onChange={(e) => setNewProjectName(e.target.value)}
            placeholder="New project name (optional, auto-named if blank)..."
            className="flex-1 min-w-[180px] h-9 px-3 rounded-lg bg-[#070A10] border border-[#243045] text-xs sm:text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-400"
          />
          <button
            type="submit"
            style={{ touchAction: 'manipulation' }}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 h-9 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-display font-bold text-xs cursor-pointer whitespace-nowrap shrink-0"
          >
            <FilePlus2 className="w-4 h-4 shrink-0" />
            <span>+ NEW PROJECT</span>
          </button>
        </form>

        {/* Subtle safety note */}
        <div className="px-3 sm:px-4 py-1.5 bg-[#0B1019] border-b border-[#1A2233] text-[11px] text-slate-400 flex items-center justify-between gap-2 shrink-0">
          <span>
            Each project has its own unique ID and auto-saves independently. Creating a new project never overwrites existing projects.
          </span>
        </div>

        {importError && (
          <div className="mx-3 sm:mx-4 mt-2 px-3 py-2 rounded-lg bg-rose-500/15 border border-rose-400/50 text-xs text-rose-200 flex items-center justify-between gap-2 shrink-0">
            <span>{importError}</span>
            <button
              type="button"
              onClick={() => setImportError(null)}
              className="text-rose-200 hover:text-white text-xs font-semibold cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Saved Projects List */}
        <div className="flex-1 min-h-0 overflow-y-auto synth-scroll p-3 sm:p-4 flex flex-col gap-2">
          {projects.map((proj) => {
            const isActive = proj.id === activeProjectId;
            const isRenaming = renamingId === proj.id;

            return (
              <div
                key={proj.id}
                className={`rounded-xl border p-2.5 sm:p-3 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${
                  isActive
                    ? 'bg-emerald-500/10 border-emerald-400/70'
                    : 'bg-[#121927] border-[#253147] hover:border-[#374868]'
                }`}
              >
                <div className="min-w-0 flex-1">
                  {isRenaming ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        ref={renameInputRef}
                        aria-label={`Rename ${proj.name}`}
                        type="text"
                        value={renameDraft}
                        onChange={(e) => setRenameDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            commitRename(proj.id);
                          } else if (e.key === 'Escape') {
                            e.preventDefault();
                            cancelRename();
                          }
                        }}
                        className="flex-1 min-w-0 h-8 px-2.5 rounded-lg bg-[#070A10] border border-cyan-400 text-xs sm:text-sm font-medium text-white focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => commitRename(proj.id)}
                        style={{ touchAction: 'manipulation' }}
                        className="inline-flex items-center gap-1 px-2.5 h-8 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-display font-bold text-[11px] cursor-pointer shrink-0"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Save</span>
                      </button>
                      <button
                        type="button"
                        onClick={cancelRename}
                        style={{ touchAction: 'manipulation' }}
                        className="px-2 h-8 rounded-lg bg-[#090D16] border border-[#2A374E] text-slate-300 hover:text-white text-[11px] font-medium cursor-pointer shrink-0"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-display font-bold text-sm text-white truncate">
                          {proj.name}
                        </span>
                        {isActive && (
                          <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-400/60 text-emerald-300 font-display font-bold text-[10px] tracking-wider whitespace-nowrap shrink-0">
                            OPEN
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 mt-1 text-[11px] text-slate-400 font-mono-num">
                        <span className="text-amber-300">{proj.bpm} BPM</span>
                        <span aria-hidden="true">·</span>
                        <span className="text-cyan-300">{proj.timeSignature}</span>
                        <span aria-hidden="true">·</span>
                        <span>{formatUpdatedTime(proj.updatedAt)}</span>
                        <span aria-hidden="true" className="hidden sm:inline">·</span>
                        <span className="hidden sm:inline text-[10px] text-slate-500 truncate max-w-[140px]">
                          {proj.id}
                        </span>
                      </div>
                    </>
                  )}
                </div>

                {/* Actions per project */}
                {!isRenaming && (
                  <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                    {isActive ? (
                      <button
                        type="button"
                        onClick={onClose}
                        style={{ touchAction: 'manipulation' }}
                        className="px-3 h-8 rounded-lg bg-emerald-500/20 border border-emerald-400/60 text-emerald-200 font-display font-bold text-[11px] cursor-pointer whitespace-nowrap"
                      >
                        ACTIVE
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          onSelectProject(proj.id);
                          onClose();
                        }}
                        style={{ touchAction: 'manipulation' }}
                        className="inline-flex items-center gap-1 px-3 h-8 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-display font-bold text-[11px] cursor-pointer whitespace-nowrap"
                      >
                        <FolderOpen className="w-3.5 h-3.5" />
                        <span>OPEN</span>
                      </button>
                    )}

                    <button
                      type="button"
                      title="Rename Project"
                      aria-label={`Rename ${proj.name}`}
                      onClick={() => startRename(proj)}
                      style={{ touchAction: 'manipulation' }}
                      className="inline-flex items-center gap-1 px-2.5 h-8 rounded-lg bg-[#090D16] hover:bg-[#192438] border border-[#2A374E] text-slate-200 hover:text-cyan-300 text-[11px] font-medium cursor-pointer whitespace-nowrap"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      <span>Rename</span>
                    </button>

                    <button
                      type="button"
                      title="Duplicate Project as Copy"
                      aria-label={`Duplicate ${proj.name}`}
                      onClick={() => onDuplicateProject(proj.id)}
                      style={{ touchAction: 'manipulation' }}
                      className="w-8 h-8 rounded-lg bg-[#090D16] hover:bg-[#192438] border border-[#2A374E] flex items-center justify-center text-slate-300 hover:text-emerald-300 cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      title="Export Project JSON"
                      aria-label={`Export ${proj.name}`}
                      onClick={() => handleExportProject(proj)}
                      style={{ touchAction: 'manipulation' }}
                      className="w-8 h-8 rounded-lg bg-[#090D16] hover:bg-[#192438] border border-[#2A374E] flex items-center justify-center text-slate-300 hover:text-amber-300 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      title="Delete Project"
                      aria-label={`Delete ${proj.name}`}
                      onClick={() => {
                        setRenamingId(null);
                        setConfirmDeleteTarget(proj);
                      }}
                      style={{ touchAction: 'manipulation' }}
                      className="inline-flex items-center gap-1 px-2.5 h-8 rounded-lg bg-[#090D16] hover:bg-rose-500/15 border border-[#2A374E] hover:border-rose-400/60 text-slate-300 hover:text-rose-300 text-[11px] font-medium cursor-pointer whitespace-nowrap"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 px-3 sm:px-4 py-2 bg-[#121926] border-t border-[#253147] shrink-0">
          <span className="text-[11px] text-slate-400 truncate">
            Projects persist permanently in device storage until you delete them.
          </span>
          <button
            type="button"
            onClick={onClose}
            style={{ touchAction: 'manipulation' }}
            className="px-4 h-8 rounded-lg bg-[#090D16] hover:bg-[#192438] border border-[#2E3C56] text-slate-100 font-display font-bold text-xs cursor-pointer whitespace-nowrap shrink-0"
          >
            DONE
          </button>
        </div>

        {/* In-App Explicit Delete Confirmation Overlay */}
        {confirmDeleteTarget && (
          <div
            role="alertdialog"
            aria-modal="true"
            aria-label="Confirm Project Deletion"
            className="absolute inset-0 z-20 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4"
          >
            <div className="w-full max-w-md rounded-2xl border border-rose-500/60 bg-[#111622] p-4 sm:p-5 shadow-2xl flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-400/50 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5 text-rose-400" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-display text-sm sm:text-base font-bold text-white">
                    Delete Project Permanently?
                  </h3>
                  <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                    Are you sure you want to delete{' '}
                    <strong className="text-rose-200">
                      "{confirmDeleteTarget.name}"
                    </strong>
                    ? All patterns, synth patches, and tracks in this project will be permanently removed. Other saved projects will not be affected.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setConfirmDeleteTarget(null)}
                  style={{ touchAction: 'manipulation' }}
                  className="px-3.5 h-9 rounded-lg bg-[#0A0E17] hover:bg-[#192338] border border-[#2C3A54] text-xs font-display font-bold text-slate-200 cursor-pointer"
                >
                  CANCEL
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const targetId = confirmDeleteTarget.id;
                    setConfirmDeleteTarget(null);
                    onDeleteProject(targetId);
                  }}
                  style={{ touchAction: 'manipulation' }}
                  className="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-lg bg-rose-500 hover:bg-rose-400 text-white font-display font-bold text-xs cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>DELETE PERMANENTLY</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
