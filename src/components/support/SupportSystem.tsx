import React, { useState, useEffect } from 'react';
import { collection, doc, updateDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { UserProfile, SupportTicket, TicketStatus, TicketReply } from '../../types';
import { logAuditAction } from '../../lib/auditLogger';
import { SupportTicketForm } from './SupportTicketForm';
import { 
  LifeBuoy, Plus, PhoneCall, MessageSquare, Send, CheckCircle2, 
  Clock, AlertCircle, Image as ImageIcon, X, Shield, Loader2, ArrowLeft, ExternalLink,
  Tag, Mail, Paperclip, FileText, ChevronRight, RotateCw
} from 'lucide-react';
import { usePageRefresh, useRefresh } from '../../context/RefreshContext';

interface SupportSystemProps {
  user: UserProfile;
}

const STATUS_CONFIG: Record<TicketStatus, { label: string; bg: string; text: string }> = {
  open: { label: 'Open', bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700' },
  in_progress: { label: 'In Progress', bg: 'bg-blue-50 border-blue-200', text: 'text-blue-700' },
  resolved: { label: 'Resolved', bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700' },
  closed: { label: 'Closed', bg: 'bg-slate-100 border-slate-300', text: 'text-slate-600' },
};

const PRIORITY_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  low: { label: 'Low', bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700' },
  medium: { label: 'Medium', bg: 'bg-amber-50 border-amber-200', text: 'text-amber-800' },
  high: { label: 'High', bg: 'bg-rose-50 border-rose-200', text: 'text-rose-700' },
};

export const SupportSystem: React.FC<SupportSystemProps> = ({ user }) => {
  const isStaff = user.role === 'super_admin' || user.role === 'admin';
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [replySubmitting, setReplySubmitting] = useState(false);

  const [lastCheckTime, setLastCheckTime] = useState<number>(Date.now());
  const { isRefreshing, showToast, refreshCurrentPage } = useRefresh();

  const handleRefresh = async () => {
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const updatedTickets = tickets.filter((t) => {
      const uTime = t.updatedAt?.toDate ? t.updatedAt.toDate().getTime() : new Date(t.updatedAt || t.createdAt || 0).getTime();
      return uTime > lastCheckTime;
    });

    if (updatedTickets.length > 0) {
      showToast(`✓ Tickets refreshed! ${updatedTickets.length} new or updated support ticket(s) found.`, 'success');
    } else {
      showToast('✓ Support tickets are fully up to date', 'success');
    }

    setLastCheckTime(Date.now());
  };

  usePageRefresh('support', handleRefresh);

  useEffect(() => {
    // Realtime subscription for support tickets
    const q = collection(db, 'supportTickets');
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: SupportTicket[] = [];
      snapshot.forEach((d) => {
        const ticket = Object.assign({ id: d.id }, d.data()) as unknown as SupportTicket;
        if (isStaff || ticket.resellerId === user.uid) {
          list.push(ticket);
        }
      });

      list.sort((a, b) => {
        const timeA = a.updatedAt?.toDate ? a.updatedAt.toDate().getTime() : new Date(a.updatedAt || a.createdAt || 0).getTime();
        const timeB = b.updatedAt?.toDate ? b.updatedAt.toDate().getTime() : new Date(b.updatedAt || b.createdAt || 0).getTime();
        return timeB - timeA;
      });

      setTickets(list);
      setLoading(false);

      // Keep selected ticket updated in realtime if viewing detail
      if (selectedTicket) {
        const updated = list.find((t) => t.id === selectedTicket.id);
        if (updated) setSelectedTicket(updated);
      }
    });

    return () => unsubscribe();
  }, [user.uid, isStaff]);

  const handleSendReply = async () => {
    if (!selectedTicket || !replyText.trim()) return;

    setReplySubmitting(true);
    try {
      const newReply: TicketReply = {
        id: Date.now().toString(),
        senderId: user.uid,
        senderName: user.fullName,
        senderRole: user.role,
        message: replyText.trim(),
        createdAt: new Date().toISOString(),
      };

      const updatedReplies = [...(selectedTicket.replies || []), newReply];

      const ticketRef = doc(db, 'supportTickets', selectedTicket.id);
      await updateDoc(ticketRef, {
        replies: updatedReplies,
        updatedAt: serverTimestamp(),
      });

      setReplyText('');
    } catch (err) {
      console.error('Error sending ticket reply:', err);
      alert('Failed to send reply.');
    } finally {
      setReplySubmitting(false);
    }
  };

  const handleUpdateStatus = async (ticketId: string, newStatus: TicketStatus) => {
    try {
      await updateDoc(doc(db, 'supportTickets', ticketId), {
        status: newStatus,
        updatedAt: serverTimestamp(),
      });

      await logAuditAction(
        user.uid,
        user.fullName,
        user.role,
        'UPDATE_TICKET_STATUS',
        ticketId,
        `Updated support ticket status to ${newStatus}`
      );
    } catch (err) {
      console.error('Error updating ticket status:', err);
      alert('Failed to update ticket status.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Quick Contact Actions */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-md shadow-blue-600/30">
              <LifeBuoy className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">Support & Help Desk</h2>
              <p className="text-xs text-slate-500 mt-0.5">Need help with orders, payments, or products? Get in touch with our team.</p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => refreshCurrentPage()}
              disabled={isRefreshing || loading}
              className="bg-white border border-slate-200 hover:border-blue-400 text-slate-700 hover:text-blue-600 text-xs font-semibold px-3 py-2.5 rounded-xl shadow-2xs transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
              title="Refresh Tickets"
            >
              <RotateCw className={`w-3.5 h-3.5 text-blue-600 ${isRefreshing || loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>

            {!isStaff && (
              <button
                type="button"
                onClick={() => {
                  setSelectedTicket(null);
                  setIsFormOpen(!isFormOpen);
                }}
                className="flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-sm transition-all cursor-pointer"
              >
                {isFormOpen ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                <span>{isFormOpen ? 'Back to Tickets' : 'Raise Support Ticket'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Direct Contact Buttons */}
        <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-3">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Instant Contact:</span>
          <a
            href="https://wa.me/8801577351518"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-xs transition-all"
          >
            <MessageSquare className="w-4 h-4" />
            <span>Chat on WhatsApp (+8801577351518)</span>
            <ExternalLink className="w-3 h-3 opacity-70" />
          </a>
          <a
            href="tel:01577351518"
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-xs transition-all"
          >
            <PhoneCall className="w-4 h-4 text-blue-400" />
            <span>Direct Call (01577351518)</span>
          </a>
        </div>
      </div>

      {/* Raise Ticket Form Component (Reseller) */}
      {isFormOpen && !isStaff && (
        <SupportTicketForm
          user={user}
          onSuccess={() => {
            setIsFormOpen(false);
          }}
          onCancel={() => setIsFormOpen(false)}
        />
      )}

      {/* Main Grid: Ticket List & Detail View */}
      {(!isFormOpen || isStaff) && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Ticket List Column */}
          <div className={`space-y-4 ${selectedTicket ? 'lg:col-span-5 hidden lg:block' : 'lg:col-span-12'}`}>
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-slate-100 font-bold text-xs text-slate-900 uppercase tracking-wider flex items-center justify-between">
                <span>{isStaff ? 'All Support Tickets' : 'My Support Tickets'} ({tickets.length})</span>
                {!isStaff && (
                  <button
                    onClick={() => {
                      setSelectedTicket(null);
                      setIsFormOpen(true);
                    }}
                    className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>New Ticket</span>
                  </button>
                )}
              </div>

              {loading ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-400 space-y-2">
                  <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                  <p className="text-xs font-medium">Loading support tickets...</p>
                </div>
              ) : tickets.length === 0 ? (
                <div className="p-12 text-center text-slate-400 text-xs space-y-3">
                  <LifeBuoy className="w-8 h-8 text-slate-300 mx-auto" />
                  <p>No support tickets found.</p>
                  {!isStaff && (
                    <button
                      onClick={() => setIsFormOpen(true)}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer"
                    >
                      Create Your First Ticket
                    </button>
                  )}
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {tickets.map((t) => {
                    const statusConf = STATUS_CONFIG[t.status] || STATUS_CONFIG.open;
                    const priorityConf = PRIORITY_CONFIG[t.priority] || PRIORITY_CONFIG.medium;
                    const isSelected = selectedTicket?.id === t.id;
                    const dateObj = t.createdAt?.toDate ? t.createdAt.toDate() : new Date(t.createdAt || 0);
                    const ticketDisplayId = t.ticketId || `TICKET-${t.id.slice(0, 6).toUpperCase()}`;

                    return (
                      <div
                        key={t.id}
                        onClick={() => setSelectedTicket(t)}
                        className={`p-4 transition-all cursor-pointer ${
                          isSelected ? 'bg-blue-50/80 border-l-4 border-blue-600' : 'hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border uppercase ${statusConf.bg} ${statusConf.text}`}>
                              {statusConf.label}
                            </span>
                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border uppercase ${priorityConf.bg} ${priorityConf.text}`}>
                              {priorityConf.label} Priority
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {dateObj.toLocaleDateString('en-GB')}
                          </span>
                        </div>

                        <div className="flex items-center justify-between gap-2 mt-1">
                          <h4 className="font-bold text-slate-900 text-xs line-clamp-1">{t.subject}</h4>
                          <span className="text-[10px] font-mono font-bold text-slate-500 shrink-0">{ticketDisplayId}</span>
                        </div>
                        
                        {isStaff && (
                          <p className="text-[11px] font-semibold text-blue-600 mt-0.5">
                            Reseller: {t.resellerName} {t.resellerShopName ? `(${t.resellerShopName})` : ''}
                          </p>
                        )}

                        <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 text-[10px] text-slate-500">
                          <span className="font-medium text-slate-600">{t.category}</span>
                          <span className="font-semibold text-slate-700">
                            {t.replies?.length || 0} replies
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Ticket Detail & Reply Thread View Column */}
          {selectedTicket && (
            <div className="lg:col-span-7 space-y-4">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-full min-h-[500px]">
                {/* Header */}
                <div className="p-4 bg-slate-900 text-white flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setSelectedTicket(null)}
                      className="p-1 text-slate-400 hover:text-white lg:hidden"
                    >
                      <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-mono font-bold text-blue-400 bg-slate-800 px-2 py-0.5 rounded">
                          {selectedTicket.ticketId || `TICKET-${selectedTicket.id.slice(0, 6).toUpperCase()}`}
                        </span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${PRIORITY_CONFIG[selectedTicket.priority]?.bg || ''} ${PRIORITY_CONFIG[selectedTicket.priority]?.text || ''}`}>
                          {selectedTicket.priority} priority
                        </span>
                      </div>
                      <h3 className="font-bold text-sm text-white line-clamp-1 mt-1">{selectedTicket.subject}</h3>
                    </div>
                  </div>

                  {/* Staff Status Changer */}
                  {isStaff ? (
                    <select
                      value={selectedTicket.status}
                      onChange={(e) => handleUpdateStatus(selectedTicket.id, e.target.value as TicketStatus)}
                      className="bg-slate-800 text-white text-xs border border-slate-700 rounded-lg px-2.5 py-1.5 outline-none font-bold cursor-pointer"
                    >
                      <option value="open">Status: Open</option>
                      <option value="in_progress">Status: In Progress</option>
                      <option value="resolved">Status: Resolved</option>
                      <option value="closed">Status: Closed</option>
                    </select>
                  ) : (
                    <span className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${STATUS_CONFIG[selectedTicket.status].bg} ${STATUS_CONFIG[selectedTicket.status].text}`}>
                      {STATUS_CONFIG[selectedTicket.status].label}
                    </span>
                  )}
                </div>

                {/* Ticket Meta Details Bar */}
                <div className="px-6 py-2.5 bg-slate-100 border-b border-slate-200 text-xs flex flex-wrap items-center justify-between gap-2 text-slate-600">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span><strong>Category:</strong> {selectedTicket.category}</span>
                    {selectedTicket.orderNumber && (
                      <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-mono font-bold">
                        Order: {selectedTicket.orderNumber}
                      </span>
                    )}
                    {selectedTicket.email && (
                      <span className="flex items-center gap-1 text-slate-500">
                        <Mail className="w-3.5 h-3.5" />
                        <span>{selectedTicket.email}</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Ticket Body & Thread */}
                <div className="p-6 flex-1 overflow-y-auto space-y-4 bg-slate-50/50">
                  {/* Original Message Card */}
                  <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-2">
                    <div className="flex items-center justify-between text-xs border-b border-slate-100 pb-2">
                      <span className="font-bold text-slate-900 flex items-center gap-1.5">
                        <LifeBuoy className="w-3.5 h-3.5 text-blue-600" />
                        <span>{selectedTicket.resellerName} {selectedTicket.resellerShopName ? `(${selectedTicket.resellerShopName})` : ''}</span>
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">Original Ticket</span>
                    </div>
                    <p className="text-xs text-slate-800 whitespace-pre-line leading-relaxed">
                      {selectedTicket.description}
                    </p>
                    {(selectedTicket.attachmentUrl || selectedTicket.imageUrl) && (
                      <div className="pt-2 border-t border-slate-100 mt-2">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Attachment:</span>
                        <a
                          href={selectedTicket.attachmentUrl || selectedTicket.imageUrl || '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg border border-slate-300 transition-colors"
                        >
                          <Paperclip className="w-3.5 h-3.5" />
                          <span>View Attachment / Evidence</span>
                        </a>
                      </div>
                    )}
                  </div>

                  {/* Reply Thread */}
                  {selectedTicket.replies && selectedTicket.replies.length > 0 && (
                    <div className="space-y-3 pt-2">
                      <h5 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Conversation History</h5>
                      {selectedTicket.replies.map((reply) => {
                        const isSelf = reply.senderId === user.uid;
                        const isStaffReply = reply.senderRole === 'super_admin' || reply.senderRole === 'admin';

                        return (
                          <div
                            key={reply.id}
                            className={`p-3.5 rounded-2xl max-w-[85%] text-xs space-y-1 ${
                              isSelf
                                ? 'ml-auto bg-blue-600 text-white rounded-br-xs'
                                : isStaffReply
                                ? 'bg-slate-900 text-white rounded-bl-xs'
                                : 'bg-white text-slate-800 border border-slate-200 shadow-2xs rounded-bl-xs'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-4 text-[10px] opacity-80 border-b border-white/10 pb-1 mb-1">
                              <span className="font-bold flex items-center gap-1">
                                {isStaffReply && <Shield className="w-3 h-3 text-amber-400" />}
                                <span>{reply.senderName}</span>
                              </span>
                              <span className="font-mono">
                                {new Date(reply.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            <p className="whitespace-pre-line leading-relaxed">{reply.message}</p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Reply Input */}
                {selectedTicket.status !== 'closed' ? (
                  <div className="p-4 bg-white border-t border-slate-200 space-y-2">
                    <div className="flex gap-2">
                      <textarea
                        rows={2}
                        placeholder="Type a reply..."
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        className="flex-1 bg-slate-50 border border-slate-300 text-slate-900 text-xs rounded-xl p-3 focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none"
                      />
                      <button
                        onClick={handleSendReply}
                        disabled={replySubmitting || !replyText.trim()}
                        className="px-5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl flex items-center justify-center shrink-0 shadow-sm transition-all cursor-pointer"
                      >
                        {replySubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-slate-100 border-t border-slate-200 text-center text-xs text-slate-500 font-medium">
                    This support ticket is closed.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
