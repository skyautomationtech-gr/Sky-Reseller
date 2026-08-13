import React, { useState, useEffect } from 'react';
import { UserProfile, ChangelogEntry, ReleaseType } from '../../types';
import { 
  getChangelogs, publishNewVersion, updateChangelog, deleteChangelog, getCurrentAppVersion 
} from '../../lib/versionService';
import { logAuditAction } from '../../lib/auditLogger';
import { 
  Sparkles, Plus, Edit2, Trash2, CheckCircle2, AlertCircle, 
  Loader2, Tag, Calendar, Layers, ShieldCheck
} from 'lucide-react';

interface VersionManagerFormProps {
  user: UserProfile;
  onVersionUpdated?: () => void;
}

export const VersionManagerForm: React.FC<VersionManagerFormProps> = ({ user, onVersionUpdated }) => {
  const [changelogs, setChangelogs] = useState<ChangelogEntry[]>([]);
  const [currentVersion, setCurrentVersion] = useState<string>('1.0.0');
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form states
  const [versionNum, setVersionNum] = useState('');
  const [releaseType, setReleaseType] = useState<ReleaseType>('minor');
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');

  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Editing state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editType, setEditType] = useState<ReleaseType>('minor');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const curr = await getCurrentAppVersion();
    setCurrentVersion(curr.version || '1.0.0');
    const logs = await getChangelogs();
    setChangelogs(logs);
    setLoading(false);
  };

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    // Semver regex validation
    const semverRegex = /^\d+\.\d+\.\d+$/;
    if (!semverRegex.test(versionNum.trim())) {
      setErrorMsg('Version number must follow Semantic Versioning format (e.g., 1.1.0 or 2.0.1).');
      return;
    }

    if (!title.trim()) {
      setErrorMsg('Please enter a release title.');
      return;
    }

    if (!notes.trim()) {
      setErrorMsg('Please enter release notes (at least one bullet line).');
      return;
    }

    setIsSubmitting(true);
    try {
      const ok = await publishNewVersion({
        version: versionNum.trim(),
        title: title.trim(),
        description: notes.trim(),
        releaseType,
        publishedBy: user.uid,
        publishedByName: user.fullName,
      });

      if (ok) {
        setSuccessMsg(`Version v${versionNum.trim()} published successfully! User popups triggered.`);
        logAuditAction(
          user.uid,
          user.fullName,
          user.role,
          'PUBLISH_APP_VERSION',
          `Published new app version v${versionNum.trim()} (${releaseType}): ${title.trim()}`
        );

        setVersionNum('');
        setTitle('');
        setNotes('');
        setReleaseType('minor');

        await loadData();
        if (onVersionUpdated) onVersionUpdated();
      } else {
        setErrorMsg('Failed to publish version update.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error publishing version.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartEdit = (log: ChangelogEntry) => {
    setEditingId(log.id);
    setEditTitle(log.title);
    setEditNotes(log.description);
    setEditType(log.releaseType);
  };

  const handleSaveEdit = async (id: string) => {
    if (!editTitle.trim() || !editNotes.trim()) return;
    const ok = await updateChangelog(id, {
      title: editTitle.trim(),
      description: editNotes.trim(),
      releaseType: editType,
    });
    if (ok) {
      logAuditAction(user.uid, user.fullName, user.role, 'UPDATE_CHANGELOG', `Updated changelog entry ${id}`);
      setEditingId(null);
      await loadData();
    }
  };

  const handleDelete = async (id: string, ver: string) => {
    if (!window.confirm(`Are you sure you want to delete changelog entry for v${ver}?`)) return;
    const ok = await deleteChangelog(id);
    if (ok) {
      logAuditAction(user.uid, user.fullName, user.role, 'DELETE_CHANGELOG', `Deleted changelog for v${ver}`);
      await loadData();
    }
  };

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
    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6">
      <div className="flex items-center justify-between border-b border-slate-100 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 border border-purple-200 flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">App Version & Changelog Manager</h3>
            <p className="text-xs text-slate-500">
              Publish system release notes to trigger automatic "What's New" popups for resellers and admins.
            </p>
          </div>
        </div>

        <div className="text-right">
          <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Active Version</span>
          <span className="text-sm font-mono font-extrabold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-md border border-blue-200">
            v{currentVersion}
          </span>
        </div>
      </div>

      {errorMsg && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 p-3 rounded-xl text-xs font-semibold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 p-3 rounded-xl text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* FORM: PUBLISH NEW VERSION */}
      <form onSubmit={handlePublish} className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-4">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
          <Plus className="w-4 h-4 text-blue-600" /> Publish New Version Release
        </h4>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Version Number (e.g. 1.1.0) *
            </label>
            <input
              type="text"
              placeholder="1.1.0"
              value={versionNum}
              onChange={(e) => setVersionNum(e.target.value)}
              required
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-blue-500 font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Release Type *
            </label>
            <div className="flex gap-1.5">
              {(['major', 'minor', 'patch', 'hotfix'] as ReleaseType[]).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setReleaseType(type)}
                  className={`flex-1 py-1.5 text-[11px] font-bold rounded-lg border uppercase transition-all ${
                    releaseType === type
                      ? getBadgeStyle(type) + ' shadow-xs ring-1 ring-blue-500'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Release Headline Title *
          </label>
          <input
            type="text"
            placeholder="e.g. Reseller Home Page & Color Variants Update"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Release Notes (One change per line — converts to bullet list) *
          </label>
          <textarea
            rows={4}
            placeholder={`• Added Daraz-style storefront with category filters\n• Enabled multi-variant color selections\n• Added automated wallet payout tracking`}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            required
            className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md shadow-blue-600/20 active:scale-98 transition-all flex items-center gap-2 disabled:opacity-50"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Publishing Release...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 text-amber-300" />
              <span>Publish Version Update</span>
            </>
          )}
        </button>
      </form>

      {/* TABLE / LIST OF PAST RELEASES */}
      <div className="space-y-3">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
          Published Changelog History
        </h4>

        {loading ? (
          <div className="text-center py-6 text-xs text-slate-400">Loading version logs...</div>
        ) : changelogs.length === 0 ? (
          <div className="text-center py-6 text-xs text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
            No version changelogs recorded yet.
          </div>
        ) : (
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 uppercase text-[10px]">
                <tr>
                  <th className="p-3">Version</th>
                  <th className="p-3">Type</th>
                  <th className="p-3">Title & Notes</th>
                  <th className="p-3">Published</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {changelogs.map((log) => {
                  const isEditing = editingId === log.id;
                  const formattedDate = log.publishedAt
                    ? (log.publishedAt.toDate ? log.publishedAt.toDate() : new Date(log.publishedAt)).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                      })
                    : '';

                  return (
                    <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-3 font-mono font-bold text-slate-900 align-top">
                        v{log.version}
                        {log.version === currentVersion && (
                          <span className="block text-[9px] font-sans font-extrabold text-emerald-600 uppercase">
                            Current Active
                          </span>
                        )}
                      </td>

                      <td className="p-3 align-top">
                        {isEditing ? (
                          <select
                            value={editType}
                            onChange={(e) => setEditType(e.target.value as ReleaseType)}
                            className="text-xs p-1 border rounded bg-white"
                          >
                            <option value="major">Major</option>
                            <option value="minor">Minor</option>
                            <option value="patch">Patch</option>
                            <option value="hotfix">Hotfix</option>
                          </select>
                        ) : (
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md uppercase border ${getBadgeStyle(log.releaseType)}`}>
                            {log.releaseType}
                          </span>
                        )}
                      </td>

                      <td className="p-3 align-top max-w-md">
                        {isEditing ? (
                          <div className="space-y-2">
                            <input
                              type="text"
                              value={editTitle}
                              onChange={(e) => setEditTitle(e.target.value)}
                              className="w-full p-1.5 border rounded text-xs"
                            />
                            <textarea
                              rows={3}
                              value={editNotes}
                              onChange={(e) => setEditNotes(e.target.value)}
                              className="w-full p-1.5 border rounded text-xs"
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleSaveEdit(log.id)}
                                className="px-2.5 py-1 bg-emerald-600 text-white rounded text-[11px] font-bold"
                              >
                                Save
                              </button>
                              <button
                                onClick={() => setEditingId(null)}
                                className="px-2.5 py-1 bg-slate-200 text-slate-700 rounded text-[11px] font-bold"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div>
                            <span className="font-bold text-slate-900 block">{log.title}</span>
                            <p className="text-[11px] text-slate-500 whitespace-pre-line line-clamp-3 mt-1">
                              {log.description}
                            </p>
                          </div>
                        )}
                      </td>

                      <td className="p-3 align-top text-slate-500 text-[11px]">
                        {formattedDate}
                        {log.publishedByName && (
                          <span className="block text-[10px] text-slate-400">by {log.publishedByName}</span>
                        )}
                      </td>

                      <td className="p-3 align-top text-right">
                        {!isEditing && (
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => handleStartEdit(log)}
                              className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-slate-100 rounded-lg transition-colors"
                              title="Edit Entry"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDelete(log.id, log.version)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-slate-100 rounded-lg transition-colors"
                              title="Delete Entry"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
