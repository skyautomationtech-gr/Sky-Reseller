import React, { useState, useEffect } from 'react';
import { collection, doc, updateDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { UserProfile, SupportTicket, TicketStatus, TicketReply } from '../../types';
import { logAuditAction } from '../../lib/auditLogger';
import { SupportTicketForm } from './SupportTicketForm';
import { LiveChatWindow } from '../chat/LiveChatWindow';
import { AdminLiveChatHub } from '../chat/AdminLiveChatHub';
import { subscribeToTotalUnreadChatCount } from '../../lib/chatService';
import { 
  LifeBuoy, Plus, PhoneCall, MessageSquare, Send, CheckCircle2, 
  Clock, AlertCircle, Image as ImageIcon, X, Shield, Loader2, ArrowLeft, ExternalLink,
  Tag, Mail, Paperclip, FileText, ChevronRight, RotateCw, MessagesSquare, Sparkles
} from 'lucide-react';
import { usePageRefresh, useRefresh } from '../../context/RefreshContext';

interface SupportSystemProps {
  user: UserProfile;
  initialTab?: 'chat' | 'tickets';
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

export const SupportSystem: React.FC<SupportSystemProps> = ({ user, initialTab = 'chat' }) => {
  const isStaff = user.role === 'super_admin' || user.role === 'admin';
  const [activeSupportTab, setActiveSupportTab] = useState<'chat' | 'tickets'>(initialTab);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [replySubmitting, setReplySubmitting] = useState(false);

  const [lastCheckTime, setLastCheckTime] = useState<number>(Date.now());
  const { isRefreshing, showToast, refreshCurrentPage } = useRefresh();

  // Listen to total unread chat count
  useEffect(() => {
    const unsubChat = subscribeToTotalUnreadChatCount(user.role, user.uid, (cnt) => {
      setUnreadChatCount(cnt);
    });
    return () => unsubChat();
  }, [user.role, user.uid]);

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
      {/* Top Banner & Tab Switcher */}
      <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-tr from-blue-600 to-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-md shadow-blue-600/30">
              <LifeBuoy className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-extrabold text-slate-900">Support & Help Desk</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Realtime direct chat, order inquiries, voice notes, and official support tickets.
              </p>
            </div>
          </div>

          {/* Quick Tab Switcher */}
          <div className="flex items-center gap-2 bg-slate-100 p-1.5 rounded-2xl border border-slate-200/80">
            <button
              onClick={() => {
                setActiveSupportTab('chat');
                setIsFormOpen(false);
              }}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                activeSupportTab === 'chat'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <MessagesSquare className="w-4 h-4" />
              <span>💬 Live Chat</span>
              {unreadChatCount > 0 && (
                <span className={`text-[10px] font-black px-1.5 py-0.2 rounded-full ${
                  activeSupportTab === 'chat' ? 'bg-white text-blue-600' : 'bg-rose-500 text-white'
                }`}>
                  {unreadChatCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveSupportTab('tickets')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                activeSupportTab === 'tickets'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>🎫 Support Tickets</span>
              <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full ${
                activeSupportTab === 'tickets' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
              }`}>
                {tickets.length}
              </span>
            </button>
          </div>
        </div>

        {/* Direct External Contacts Bar */}
        <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center gap-3">
          <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">Fast Contact:</span>
          <a
            href="https://wa.me/8801577351518"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-xs transition-all"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>WhatsApp (+8801577351518)</span>
            <ExternalLink className="w-3 h-3 opacity-70" />
          </a>
          <a
            href="tel:01577351518"
            className="inline-flex items-center gap-2 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-xs transition-all"
          >
            <PhoneCall className="w-3.5 h-3.5 text-blue-400" />
            <span>Hotline (01577351518)</span>
          </a>
        </div>
      </div>

      {/* VIEW 1: LIVE REALTIME CHAT TAB */}
      {activeSupportTab === 'chat' && (
        <div>
          {isStaff ? (
            <AdminLiveChatHub user={user} />
          ) : (
            <div className="h-[650px]">
              <LiveChatWindow
                chatId={`chat_${user.uid}`}
                currentUser={user}
                partnerInfo={{
                  name: 'Sky Admin Team',
                  shopName: 'Official Helpdesk & Order Support',
                  role: 'admin',
                }}
                className="h-full"
              />
            </div>
          )}
        </div>
      )}

      {/* VIEW 2: SUPPORT TICKETS TAB */}
      {activeSupportTab === 'tickets' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-extrabold text-base text-slate-900">
              {isStaff ? 'Formal Support Tickets' : 'My Support Tickets'}
            </h3>

            {!isStaff && (
              <button
                type="button"
                onClick={() => {
                  setSelectedTicket(null);
                  setIsFormOpen(!isFormOpen);
                }}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-sm transition-all cursor-pointer"
              >
                {isFormOpen ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                <span>{isFormOpen ? 'Back to Tickets' : 'Raise New Ticket'}</span>
              </button>
            )}
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
                    <div className="p-12 text-center text-slate-400 space-y-2">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto text-blue-600" />
                      <p className="text-xs">Loading tickets...</p>
                    </div>
                  ) : tickets.length === 0 ? (
                    <div className="p-12 text-center text-slate-400 space-y-2">
                      <LifeBuoy className="w-8 h-8 mx-auto text-slate-300" />
                      <p className="text-sm font-semibold text-slate-600">No support tickets yet</p>
                      <p className="text-xs">
                        {isStaff ? 'All support requests will appear here.' : 'If you have any issues with orders or payments, raise a ticket or use Live Chat!'}
                      </p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {tickets.map((t) => {
                        const isSelected = selectedTicket?.id === t.id;
                        const statusBadge = STATUS_CONFIG[t.status] || STATUS_CONFIG.open;
                        const priorityBadge = PRIORITY_CONFIG[t.priority] || PRIORITY_CONFIG.medium;
                        const repliesCount = t.replies?.length || 0;

                        return (
                          <div
                            key={t.id}
                            onClick={() => setSelectedTicket(t)}
                            className={`p-4 transition-all cursor-pointer flex flex-col gap-2 ${
                              isSelected ? 'bg-blue-50/70 border-l-4 border-blue-600' : 'hover:bg-slate-50'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${statusBadge.bg} ${statusBadge.text}`}>
                                  {statusBadge.label}
                                </span>
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${priorityBadge.bg} ${priorityBadge.text}`}>
                                  {priorityBadge.label}
                                </span>
                              </div>
                              <span className="text-[10px] text-slate-400">
                                {t.createdAt?.toDate ? t.createdAt.toDate().toLocaleDateString() : 'Recent'}
                              </span>
                            </div>

                            <div>
                              <h4 className="font-bold text-xs text-slate-900 line-clamp-1">{t.subject}</h4>
                              <p className="text-[11px] text-slate-500 line-clamp-2 mt-0.5">{t.description}</p>
                            </div>

                            <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                              <span className="font-medium text-slate-600">
                                {isStaff ? `${t.resellerName} (${t.resellerShopName || 'Shop'})` : `Cat: ${t.category}`}
                              </span>
                              {repliesCount > 0 && (
                                <span className="flex items-center gap-1 font-semibold text-blue-600">
                                  <MessageSquare className="w-3 h-3" />
                                  {repliesCount}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Ticket Detail Column */}
              {selectedTicket && (
                <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden max-h-[750px]">
                  {/* Detail Header */}
                  <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setSelectedTicket(null)}
                        className="lg:hidden p-1 text-slate-500 hover:text-slate-900 rounded-lg"
                      >
                        <ArrowLeft className="w-5 h-5" />
                      </button>
                      <div>
                        <span className="text-[10px] font-mono font-bold text-slate-400">
                          TICKET #{selectedTicket.id.slice(0, 8).toUpperCase()}
                        </span>
                        <h3 className="font-bold text-sm text-slate-900">{selectedTicket.subject}</h3>
                      </div>
                    </div>

                    {isStaff && (
                      <div className="flex items-center gap-2">
                        <select
                          value={selectedTicket.status}
                          onChange={(e) => handleUpdateStatus(selectedTicket.id, e.target.value as TicketStatus)}
                          className="text-xs bg-white border border-slate-200 rounded-xl px-2 py-1 font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="open">Open</option>
                          <option value="in_progress">In Progress</option>
                          <option value="resolved">Resolved</option>
                          <option value="closed">Closed</option>
                        </select>
                      </div>
                    )}
                  </div>

                  {/* Detail Content & Message Thread */}
                  <div className="flex-1 p-4 overflow-y-auto space-y-4 bg-slate-50/30">
                    {/* Main Description Box */}
                    <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs space-y-3">
                      <div className="flex items-center justify-between text-xs text-slate-500 border-b border-slate-100 pb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900">{selectedTicket.resellerName}</span>
                          <span className="text-slate-300">•</span>
                          <span>{selectedTicket.email}</span>
                        </div>
                        <span className="text-[10px]">
                          {selectedTicket.createdAt?.toDate ? selectedTicket.createdAt.toDate().toLocaleString() : 'Just now'}
                        </span>
                      </div>

                      <p className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">
                        {selectedTicket.description}
                      </p>

                      {selectedTicket.attachmentUrl && (
                        <div className="pt-2">
                          <a
                            href={selectedTicket.attachmentUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-lg transition-colors"
                          >
                            <Paperclip className="w-3.5 h-3.5 text-blue-600" />
                            <span>View Attachment</span>
                          </a>
                        </div>
                      )}
                    </div>

                    {/* Replies Thread */}
                    {selectedTicket.replies && selectedTicket.replies.length > 0 && (
                      <div className="space-y-3 pt-2">
                        <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-1">
                          Conversation History
                        </h4>
                        {selectedTicket.replies.map((rep) => {
                          const isStaffReply = rep.senderRole === 'admin' || rep.senderRole === 'super_admin';
                          return (
                            <div
                              key={rep.id}
                              className={`p-3.5 rounded-xl border ${
                                isStaffReply
                                  ? 'bg-blue-50/60 border-blue-200 ml-4'
                                  : 'bg-white border-slate-200/80 mr-4'
                              }`}
                            >
                              <div className="flex items-center justify-between text-[11px] mb-1.5">
                                <div className="flex items-center gap-1.5">
                                  <span className={`font-bold ${isStaffReply ? 'text-blue-900' : 'text-slate-900'}`}>
                                    {rep.senderName}
                                  </span>
                                  {isStaffReply && (
                                    <span className="text-[9px] bg-blue-600 text-white font-bold px-1.5 py-0.2 rounded-md">
                                      STAFF
                                    </span>
                                  )}
                                </div>
                                <span className="text-slate-400 text-[10px]">
                                  {new Date(rep.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                              <p className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">
                                {rep.message}
                              </p>
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
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
