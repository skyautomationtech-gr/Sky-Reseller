import React, { useState, useEffect } from 'react';
import { ChangelogEntry, ReleaseType } from '../../types';
import { getChangelogs } from '../../lib/versionService';
import { Sparkles, Calendar, Tag, CheckCircle2, X, History, Loader2 } from 'lucide-react';

interface ChangelogModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentVersion: string;
}

export const ChangelogModal: React.FC<ChangelogModalProps> = ({
  isOpen,
  onClose,
  currentVersion
}) => {
  const [changelogs, setChangelogs] = useState<ChangelogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen) {
      fetchLogs();
    }
  }, [isOpen]);

  const fetchLogs = async () => {
    setLoading(true);
    const logs = await getChangelogs();
    setChangelogs(logs);
    setLoading(false);
  };

  if (!isOpen) return null;

  const getBadgeStyle = (type: ReleaseType) => {
    switch (type) {
      case 'major':
        return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'minor':
        return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      case 'patch':
        return 'bg-slate-100 text-slate-700 border-slate-200';
      case 'hotfix':
        return 'bg-rose-100 text-rose-700 border-rose-200';
      default:
        return 'bg-blue-100 text-blue-700 border-blue-200';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/75 backdrop-blur-xs">
      <div className="bg-white rounded-3xl border border-slate-200 max-w-2xl w-full overflow-hidden shadow-2xl animate-in zoom-in-95 duration-150 flex flex-col max-h-[85vh]">
        {/* Modal Header */}
        <div className="bg-slate-900 text-white p-5 sm:p-6 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/30 text-blue-400 border border-blue-500/30 flex items-center justify-center">
              <History className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold">App Version History & Changelog</h2>
                <span className="bg-blue-500/20 text-blue-300 font-mono text-[11px] font-bold px-2 py-0.5 rounded-md border border-blue-500/30">
                  Current: v{currentVersion}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Full list of feature releases, enhancements, and system updates.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-xl hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-slate-400 gap-2">
              <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
              <span className="text-xs font-semibold">Loading version history...</span>
            </div>
          ) : changelogs.length === 0 ? (
            <div className="text-center py-12 space-y-2">
              <Sparkles className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="text-xs text-slate-500 font-medium">No version logs published yet.</p>
            </div>
          ) : (
            <div className="space-y-6 relative before:absolute before:left-3.5 before:top-4 before:bottom-4 before:w-0.5 before:bg-slate-200">
              {changelogs.map((log) => {
                const formattedDate = log.publishedAt
                  ? (log.publishedAt.toDate ? log.publishedAt.toDate() : new Date(log.publishedAt)).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric'
                    })
                  : '';

                const bulletPoints = log.description
                  ? log.description
                      .split('\n')
                      .map(l => l.trim())
                      .filter(l => l.length > 0)
                      .map(l => l.startsWith('•') || l.startsWith('-') ? l.substring(1).trim() : l)
                  : [];

                return (
                  <div key={log.id} className="relative pl-8 space-y-2">
                    {/* Timeline Dot */}
                    <div className="absolute left-1.5 top-1.5 w-4 h-4 rounded-full bg-white border-4 border-blue-600 ring-2 ring-white" />

                    <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 pb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-extrabold text-slate-900">v{log.version}</span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md uppercase border ${getBadgeStyle(log.releaseType)}`}>
                            {log.releaseType}
                          </span>
                        </div>
                        {formattedDate && (
                          <div className="flex items-center gap-1 text-[11px] text-slate-500">
                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                            <span>{formattedDate}</span>
                          </div>
                        )}
                      </div>

                      <h4 className="text-xs font-bold text-slate-800">{log.title}</h4>

                      {bulletPoints.length > 0 ? (
                        <ul className="space-y-1.5">
                          {bulletPoints.map((pt, i) => (
                            <li key={i} className="flex items-start gap-2 text-xs text-slate-600">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                              <span>{pt}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-xs text-slate-600">{log.description}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 text-right">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-xs transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
