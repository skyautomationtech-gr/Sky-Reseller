import React, { useState, useEffect } from 'react';
import { collection, doc, updateDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { UserProfile, ResellerFeedback, FeedbackType, BugSeverity } from '../../types';
import { logAuditAction } from '../../lib/auditLogger';
import { 
  MessageSquare, Filter, AlertTriangle, Lightbulb, Bug, Sparkles, CheckCircle2, 
  Clock, Mail, Paperclip, Search, ExternalLink, Shield, Loader2, RefreshCw, X, ChevronRight, User
} from 'lucide-react';

interface AdminFeedbackListProps {
  user: UserProfile;
}

const TYPE_BADGE_STYLE: Record<FeedbackType, { bg: string; text: string; icon: React.ElementType }> = {
  'Complaint': { bg: 'bg-rose-100 border-rose-200', text: 'text-rose-800', icon: AlertTriangle },
  'Suggestion/Feedback': { bg: 'bg-blue-100 border-blue-200', text: 'text-blue-800', icon: Lightbulb },
  'Bug Report': { bg: 'bg-amber-100 border-amber-200', text: 'text-amber-900', icon: Bug },
  'Feature Request': { bg: 'bg-emerald-100 border-emerald-200', text: 'text-emerald-800', icon: Sparkles },
};

const STATUS_BADGE: Record<string, { label: string; bg: string; text: string }> = {
  new: { label: 'New', bg: 'bg-rose-50 border-rose-200', text: 'text-rose-700' },
  reviewed: { label: 'Reviewed', bg: 'bg-blue-50 border-blue-200', text: 'text-blue-700' },
  in_progress: { label: 'In Progress', bg: 'bg-amber-50 border-amber-200', text: 'text-amber-800' },
  resolved: { label: 'Resolved', bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700' },
  closed: { label: 'Closed', bg: 'bg-slate-100 border-slate-300', text: 'text-slate-600' },
};

export const AdminFeedbackList: React.FC<AdminFeedbackListProps> = ({ user }) => {
  const [feedbackList, setFeedbackList] = useState<ResellerFeedback[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Selected item detail modal
  const [selectedItem, setSelectedItem] = useState<ResellerFeedback | null>(null);
  const [adminNotesInput, setAdminNotesInput] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);

  useEffect(() => {
    const q = collection(db, 'feedback');
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: ResellerFeedback[] = [];
      snapshot.forEach((d) => {
        list.push(Object.assign({ id: d.id }, d.data()) as unknown as ResellerFeedback);
      });

      list.sort((a, b) => {
        const timeA = a.updatedAt?.toDate ? a.updatedAt.toDate().getTime() : new Date(a.updatedAt || a.createdAt || 0).getTime();
        const timeB = b.updatedAt?.toDate ? b.updatedAt.toDate().getTime() : new Date(b.updatedAt || b.createdAt || 0).getTime();
        return timeB - timeA;
      });

      setFeedbackList(list);
      setLoading(false);

      if (selectedItem) {
        const updated = list.find((f) => f.id === selectedItem.id);
        if (updated) setSelectedItem(updated);
      }
    });

    return () => unsubscribe();
  }, []);

  const handleUpdateStatus = async (item: ResellerFeedback, newStatus: ResellerFeedback['status']) => {
    try {
      await updateDoc(doc(db, 'feedback', item.id), {
        status: newStatus,
        updatedAt: serverTimestamp(),
      });

      await logAuditAction(
        user.uid,
        user.fullName,
        user.role,
        'UPDATE_FEEDBACK_STATUS',
        item.id,
        `Updated feedback ${item.refId} status to ${newStatus}`
      );
    } catch (err) {
      console.error('Error updating status:', err);
      alert('Failed to update status.');
    }
  };

  const handleSaveNotes = async () => {
    if (!selectedItem) return;
    setSavingNotes(true);
    try {
      await updateDoc(doc(db, 'feedback', selectedItem.id), {
        adminNotes: adminNotesInput,
        updatedAt: serverTimestamp(),
      });

      alert('Admin notes saved.');
    } catch (err) {
      console.error('Error saving admin notes:', err);
      alert('Failed to save notes.');
    } finally {
      setSavingNotes(false);
    }
  };

  const filteredItems = feedbackList.filter((f) => {
    if (typeFilter !== 'all' && f.type !== typeFilter) return false;
    if (statusFilter !== 'all' && f.status !== statusFilter) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = f.title.toLowerCase().includes(q);
      const matchRef = f.refId.toLowerCase().includes(q);
      const matchName = f.resellerName.toLowerCase().includes(q);
      const matchCat = f.category.toLowerCase().includes(q);
      if (!matchTitle && !matchRef && !matchName && !matchCat) return false;
    }

    return true;
  });

  return (
    <div className="space-y-6">
      {/* Search & Filter Header */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
        {/* Search */}
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search title, ref #, reseller..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none"
          >
            <option value="all">All Types</option>
            <option value="Complaint">Complaints</option>
            <option value="Suggestion/Feedback">Suggestions</option>
            <option value="Bug Report">Bug Reports</option>
            <option value="Feature Request">Feature Requests</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none"
          >
            <option value="all">All Statuses</option>
            <option value="new">New</option>
            <option value="reviewed">Reviewed</option>
            <option value="in_progress">In Progress</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
          </select>
        </div>
      </div>

      {/* Main Feedback List Table / Cards */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 space-y-2">
            <Loader2 className="w-6 h-6 animate-spin text-indigo-600 mx-auto" />
            <p className="text-xs">Loading reseller feedback & complaints...</p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="p-12 text-center text-slate-400 space-y-2">
            <MessageSquare className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="text-xs font-medium">No complaints or feedback found matching criteria.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                  <th className="px-5 py-3.5">Ref ID</th>
                  <th className="px-5 py-3.5">Type & Category</th>
                  <th className="px-5 py-3.5">Title & Reseller</th>
                  <th className="px-5 py-3.5">Severity</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5">Date</th>
                  <th className="px-5 py-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredItems.map((f) => {
                  const typeConf = TYPE_BADGE_STYLE[f.type] || TYPE_BADGE_STYLE['Suggestion/Feedback'];
                  const IconComp = typeConf.icon;
                  const statusConf = STATUS_BADGE[f.status] || STATUS_BADGE.new;
                  const dateObj = f.createdAt?.toDate ? f.createdAt.toDate() : new Date(f.createdAt || 0);

                  return (
                    <tr key={f.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-5 py-4 font-mono font-bold text-slate-900">
                        {f.refId}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-1.5">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-extrabold border ${typeConf.bg} ${typeConf.text}`}>
                            <IconComp className="w-3 h-3" />
                            <span>{f.type}</span>
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-500 font-medium block mt-0.5">{f.category}</span>
                      </td>
                      <td className="px-5 py-4 max-w-xs">
                        <p className="font-bold text-slate-900 truncate">{f.title}</p>
                        <p className="text-[11px] text-slate-500 truncate flex items-center gap-1 mt-0.5">
                          <User className="w-3 h-3 text-slate-400" />
                          <span>{f.resellerName} {f.resellerShopName ? `(${f.resellerShopName})` : ''}</span>
                        </p>
                      </td>
                      <td className="px-5 py-4">
                        {f.severity ? (
                          <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${
                            f.severity === 'Critical' ? 'bg-rose-100 text-rose-800' :
                            f.severity === 'High' ? 'bg-amber-100 text-amber-900' :
                            'bg-slate-100 text-slate-700'
                          }`}>
                            {f.severity}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[10px]">—</span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <select
                          value={f.status}
                          onChange={(e) => handleUpdateStatus(f, e.target.value as ResellerFeedback['status'])}
                          className={`px-2 py-1 rounded-lg text-[10px] font-extrabold border cursor-pointer ${statusConf.bg} ${statusConf.text}`}
                        >
                          <option value="new">New</option>
                          <option value="reviewed">Reviewed</option>
                          <option value="in_progress">In Progress</option>
                          <option value="resolved">Resolved</option>
                          <option value="closed">Closed</option>
                        </select>
                      </td>
                      <td className="px-5 py-4 text-[11px] text-slate-500 font-mono">
                        {dateObj.toLocaleDateString('en-GB')}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <button
                          onClick={() => {
                            setSelectedItem(f);
                            setAdminNotesInput(f.adminNotes || '');
                          }}
                          className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs rounded-xl border border-indigo-200 transition-colors cursor-pointer"
                        >
                          View Details
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-xs overflow-y-auto">
          <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-auto animate-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-indigo-400 bg-slate-800 px-2 py-0.5 rounded">
                  {selectedItem.refId}
                </span>
                <span className="text-xs font-bold text-slate-300">
                  {selectedItem.type} Details
                </span>
              </div>
              <button
                onClick={() => setSelectedItem(null)}
                className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto text-xs">
              <div>
                <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded uppercase">
                  {selectedItem.category}
                </span>
                <h3 className="text-lg font-extrabold text-slate-900 mt-1">{selectedItem.title}</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Submitted by <strong>{selectedItem.resellerName}</strong> ({selectedItem.email})
                </p>
              </div>

              {/* Message */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Detailed Message</span>
                <p className="text-slate-800 whitespace-pre-line leading-relaxed">{selectedItem.message}</p>
              </div>

              {/* Attachments */}
              {selectedItem.attachmentUrls && selectedItem.attachmentUrls.length > 0 && (
                <div className="space-y-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Attachments ({selectedItem.attachmentUrls.length})
                  </span>
                  <div className="grid grid-cols-3 gap-2">
                    {selectedItem.attachmentUrls.map((url, i) => (
                      <a
                        key={i}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="relative aspect-video rounded-xl bg-slate-100 border border-slate-200 overflow-hidden group block"
                      >
                        <img src={url} alt={`Evidence ${i + 1}`} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white text-[10px] font-bold">
                          View Full Image ↗
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Status Update */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Update Status</span>
                  <span className="text-xs font-bold text-slate-800">Current: {selectedItem.status.toUpperCase()}</span>
                </div>
                <div className="flex gap-1.5">
                  {(['new', 'reviewed', 'in_progress', 'resolved', 'closed'] as ResellerFeedback['status'][]).map((st) => (
                    <button
                      key={st}
                      onClick={() => handleUpdateStatus(selectedItem, st)}
                      className={`px-2.5 py-1 text-[10px] font-extrabold rounded-lg capitalize border cursor-pointer ${
                        selectedItem.status === st
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {st.replace('_', ' ')}
                    </button>
                  ))}
                </div>
              </div>

              {/* Admin Notes */}
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Internal Admin Notes / Resolution Comments
                </label>
                <textarea
                  rows={3}
                  placeholder="Add internal notes on how this complaint/feedback was handled..."
                  value={adminNotesInput}
                  onChange={(e) => setAdminNotesInput(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
                <button
                  onClick={handleSaveNotes}
                  disabled={savingNotes}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition-colors cursor-pointer"
                >
                  {savingNotes ? 'Saving Notes...' : 'Save Admin Notes'}
                </button>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setSelectedItem(null)}
                className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
