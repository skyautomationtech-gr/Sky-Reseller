import React, { useState, useEffect } from 'react';
import { collection, query, where, orderBy, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { UserProfile, CompanySettings, SupportTicket, TicketCategory } from '../../types';
import { triggerHaptic } from '../../lib/nativeFeedback';
import { DENSITY_TOKENS as DT } from '../../utils/densityTokens';
import { 
  Phone, MessageSquare, Mail, Send, AlertTriangle, 
  LifeBuoy, ChevronRight, Clock, ExternalLink, Plus, 
  MessageCircle, Bug, CheckCircle2, Lock, ArrowLeft
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { SupportTicketForm } from '../support/SupportTicketForm';
import { SupportSystem } from '../support/SupportSystem';
import { FeedbackForm } from '../feedback/FeedbackForm';

interface HelpSupportSectionProps {
  user: UserProfile;
  canAccessFullApp?: boolean;
  onOpenLockedModal?: (featureName?: string) => void;
  onRefreshUser?: () => void;
  onBack?: () => void;
}

const STATUS_CHIPS: Record<string, { label: string; bg: string; text: string; border: string }> = {
  open: { label: 'Open', bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200' },
  in_progress: { label: 'In Progress', bg: 'bg-blue-50', text: 'text-blue-800', border: 'border-blue-200' },
  resolved: { label: 'Resolved', bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-200' },
  closed: { label: 'Closed', bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-200' },
};

export const HelpSupportSection: React.FC<HelpSupportSectionProps> = ({
  user,
  canAccessFullApp = true,
  onOpenLockedModal,
  onRefreshUser,
  onBack,
}) => {
  const isRestricted = !canAccessFullApp || user.status === 'pending';

  // Company Settings
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);

  // Tickets History
  const [myTickets, setMyTickets] = useState<SupportTicket[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(false);

  // Interactive Modals
  const [isTicketFormOpen, setIsTicketFormOpen] = useState(false);
  const [ticketFormCategory, setTicketFormCategory] = useState<TicketCategory>('Other');
  const [ticketFormInitialSubject, setTicketFormInitialSubject] = useState('');
  const [isFeedbackFormOpen, setIsFeedbackFormOpen] = useState(false);
  const [viewingSupportSystem, setViewingSupportSystem] = useState(false);

  // Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (text: string) => {
    setToastMessage(text);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Fetch Company Settings
  useEffect(() => {
    const fetchCompany = async () => {
      try {
        const sSnap = await getDoc(doc(db, 'settings', 'general'));
        if (sSnap.exists()) {
          setCompanySettings(sSnap.data() as CompanySettings);
        }
      } catch (err) {
        console.warn('Error fetching company settings:', err);
      }
    };
    fetchCompany();
  }, []);

  // Fetch Tickets History
  const fetchTickets = async () => {
    if (isRestricted) return;
    setLoadingTickets(true);
    try {
      const q = query(
        collection(db, 'supportTickets'),
        where('userId', '==', user.uid),
        orderBy('createdAt', 'desc')
      );
      const snap = await getDocs(q);
      const list: SupportTicket[] = [];
      snap.forEach((d) => {
        list.push({ id: d.id, ...d.data() } as SupportTicket);
      });
      setMyTickets(list);
    } catch (err) {
      console.warn('Error fetching tickets:', err);
    } finally {
      setLoadingTickets(false);
    }
  };

  useEffect(() => {
    fetchTickets();
  }, [user.uid, isRestricted]);

  // Open "Report a Problem" with auto-diagnostics
  const handleOpenReportProblem = () => {
    if (isRestricted) {
      if (onOpenLockedModal) onOpenLockedModal('Support Tickets');
      return;
    }
    triggerHaptic('light');

    const browserInfo = typeof navigator !== 'undefined' ? `${navigator.userAgent.slice(0, 48)}...` : 'Web';
    const initialText = `[App Problem Report]
• App Version: v1.0.0 (Build 100)
• Screen: Reseller Settings > Help & Support
• Device/Browser: ${browserInfo}
• Issue Description: `;

    setTicketFormCategory('App Bug/Technical');
    setTicketFormInitialSubject('Bug Report: App Problem Encountered');
    setIsTicketFormOpen(true);
  };

  // Open Standard Ticket Form
  const handleOpenStandardTicket = () => {
    if (isRestricted) {
      if (onOpenLockedModal) onOpenLockedModal('Support Tickets');
      return;
    }
    triggerHaptic('light');
    setTicketFormCategory('Other');
    setTicketFormInitialSubject('');
    setIsTicketFormOpen(true);
  };

  // Format Date
  const formatDate = (val: any) => {
    if (!val) return 'Recent';
    if (val.toDate) return val.toDate().toLocaleDateString();
    if (val instanceof Date) return val.toLocaleDateString();
    return String(val);
  };

  // If user opens full Support System thread viewer
  if (viewingSupportSystem) {
    return (
      <div className="space-y-3">
        <div className="pb-1 border-b border-slate-200">
          <button
            onClick={() => setViewingSupportSystem(false)}
            className="h-[32px] px-3 rounded-xl bg-white hover:bg-slate-50 text-[#04203F] text-[11px] font-bold border border-slate-200 flex items-center gap-1 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Support Menu</span>
          </button>
        </div>
        <SupportSystem user={user} initialTab="tickets" />
      </div>
    );
  }

  const supportPhone = companySettings?.phoneNumbers
    ? companySettings.phoneNumbers.split(',')[0].trim()
    : '01886123456';
  const whatsappCleanNumber = supportPhone.replace(/[^0-9]/g, '');
  const communityGroupUrl = (companySettings as any)?.communityGroupUrl || (companySettings as any)?.telegramGroupUrl;

  return (
    <div className="space-y-3.5">
      {/* Toast Feedback */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-3.5 py-1.5 rounded-full text-[12px] font-bold shadow-lg flex items-center gap-1.5 bg-[#04203F] text-white border border-teal-500/30"
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-[#3DD055]" />
            <span>{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Restricted Notice for Pending Resellers */}
      {isRestricted && (
        <div className="bg-amber-50/90 border border-amber-200/90 rounded-[14px] p-3 flex items-start gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
            <Lock className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="text-[13px] font-bold text-amber-900 leading-tight">Limited Support Access</h4>
            <p className="text-[11px] text-amber-700 mt-0.5 leading-snug">
              While your registration is pending review, you can contact our onboarding team directly via phone call or WhatsApp below.
            </p>
          </div>
        </div>
      )}

      {/* 1. DIRECT CONTACT GROUP */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between px-3 pb-0.5">
          <span className={DT.settingsGroupLabel.replace('px-3 pb-1.5', '')}>Direct Support</span>
          <span className="text-[10px] font-medium text-slate-400">
            Sat - Thu, 10 AM - 8 PM
          </span>
        </div>
        <div className={DT.settingsGroupCard}>
          {/* Call Support */}
          <a
            href={`tel:${supportPhone}`}
            className={DT.settingsRow}
          >
            <div className="flex items-center gap-2.5 min-w-0 pr-3">
              <div className="w-[28px] h-[28px] rounded-[8px] flex items-center justify-center shrink-0 border bg-teal-50 text-[#0E9AA7] border-teal-200/60">
                <Phone className="w-[18px] h-[18px]" />
              </div>
              <div className="min-w-0">
                <span className={DT.settingsRowTitle}>Call Support</span>
                <p className={DT.settingsRowHelper}>Direct voice line with helpline representative</p>
              </div>
            </div>
            <span className="font-mono text-[12px] font-bold text-[#04203F] shrink-0">
              {supportPhone}
            </span>
          </a>

          {/* WhatsApp Support */}
          <a
            href={`https://wa.me/88${whatsappCleanNumber}?text=Hello%20ReSellBD%20Support`}
            target="_blank"
            rel="noopener noreferrer"
            className={DT.settingsRow}
          >
            <div className="flex items-center gap-2.5 min-w-0 pr-3">
              <div className="w-[28px] h-[28px] rounded-[8px] flex items-center justify-center shrink-0 border bg-emerald-50 text-[#3DD055] border-emerald-200/60">
                <MessageCircle className="w-[18px] h-[18px]" />
              </div>
              <div className="min-w-0">
                <span className={DT.settingsRowTitle}>WhatsApp Support</span>
                <p className={DT.settingsRowHelper}>Fastest reply for verification & queries</p>
              </div>
            </div>
            <span className="text-[11px] font-bold text-[#3DD055] bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full shrink-0">
              Chat Now
            </span>
          </a>

          {/* Community Group Link (Hidden if not set by Admin) */}
          {communityGroupUrl && (
            <a
              href={communityGroupUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={DT.settingsRow}
            >
              <div className="flex items-center gap-2.5 min-w-0 pr-3">
                <div className="w-[28px] h-[28px] rounded-[8px] flex items-center justify-center shrink-0 border bg-blue-50 text-blue-700 border-blue-200/60">
                  <ExternalLink className="w-[18px] h-[18px]" />
                </div>
                <div className="min-w-0">
                  <span className={DT.settingsRowTitle}>Reseller Community Group</span>
                  <p className={DT.settingsRowHelper}>Join official reseller announcements group</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
            </a>
          )}

          {/* Email Support (Hidden for pending resellers) */}
          {!isRestricted && (
            <a
              href={`mailto:${companySettings?.email || 'support@resellbd.com'}?subject=Reseller%20Support%20Inquiry%20(${user.shopName || user.fullName})`}
              className={DT.settingsRow}
            >
              <div className="flex items-center gap-2.5 min-w-0 pr-3">
                <div className="w-[28px] h-[28px] rounded-[8px] flex items-center justify-center shrink-0 border bg-indigo-50 text-indigo-700 border-indigo-200/60">
                  <Mail className="w-[18px] h-[18px]" />
                </div>
                <div className="min-w-0">
                  <span className={DT.settingsRowTitle}>Email Support</span>
                  <p className={DT.settingsRowHelper}>Send formal inquiries or documentation</p>
                </div>
              </div>
              <span className="text-[11px] font-medium text-slate-600 truncate max-w-[150px] shrink-0">
                {companySettings?.email || 'support@resellbd.com'}
              </span>
            </a>
          )}
        </div>
      </div>

      {/* 2. TICKETING & FEEDBACK ACTIONS (For Approved Resellers) */}
      {!isRestricted && (
        <div className="space-y-1.5">
          <div className={DT.settingsGroupLabel}>Helpdesk & Feedback</div>
          <div className={DT.settingsGroupCard}>
            {/* Submit a Ticket */}
            <div
              onClick={handleOpenStandardTicket}
              className={DT.settingsRow}
            >
              <div className="flex items-center gap-2.5 min-w-0 pr-3">
                <div className="w-[28px] h-[28px] rounded-[8px] flex items-center justify-center shrink-0 border bg-teal-50 text-[#0E9AA7] border-teal-200/60">
                  <LifeBuoy className="w-[18px] h-[18px]" />
                </div>
                <div className="min-w-0">
                  <span className={DT.settingsRowTitle}>Submit a Ticket</span>
                  <p className={DT.settingsRowHelper}>Order issues, delivery delays, and payment queries</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
            </div>

            {/* Report a Problem (Auto-attaches App Diagnostics) */}
            <div
              onClick={handleOpenReportProblem}
              className={DT.settingsRow}
            >
              <div className="flex items-center gap-2.5 min-w-0 pr-3">
                <div className="w-[28px] h-[28px] rounded-[8px] flex items-center justify-center shrink-0 border bg-rose-50 text-rose-700 border-rose-200/60">
                  <Bug className="w-[18px] h-[18px]" />
                </div>
                <div className="min-w-0">
                  <span className={DT.settingsRowTitle}>Report a Problem</span>
                  <p className={DT.settingsRowHelper}>Auto-attaches app version, device OS, and diagnostics</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
            </div>

            {/* Complaint / Feedback */}
            <div
              onClick={() => {
                triggerHaptic('light');
                setIsFeedbackFormOpen(true);
              }}
              className={DT.settingsRow}
            >
              <div className="flex items-center gap-2.5 min-w-0 pr-3">
                <div className="w-[28px] h-[28px] rounded-[8px] flex items-center justify-center shrink-0 border bg-amber-50 text-amber-700 border-amber-200/60">
                  <AlertTriangle className="w-[18px] h-[18px]" />
                </div>
                <div className="min-w-0">
                  <span className={DT.settingsRowTitle}>Complaint / Feedback</span>
                  <p className={DT.settingsRowHelper}>Send suggestions, service reviews, or complaints</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
            </div>
          </div>
        </div>
      )}

      {/* 3. SUPPORT TICKET HISTORY (For Approved Resellers) */}
      {!isRestricted && (
        <div className="space-y-1.5 pt-1">
          <div className="flex items-center justify-between px-3 pb-0.5">
            <span className={DT.settingsGroupLabel.replace('px-3 pb-1.5', '')}>Support History</span>
            {myTickets.length > 0 && (
              <button
                onClick={() => setViewingSupportSystem(true)}
                className="text-[11px] font-bold text-[#0E9AA7] hover:underline cursor-pointer"
              >
                Open Full Thread
              </button>
            )}
          </div>

          <div className={DT.settingsGroupCard}>
            {loadingTickets ? (
              <div className="p-6 text-center text-slate-400 text-xs">Loading support history...</div>
            ) : myTickets.length === 0 ? (
              <div className="p-5 text-center text-slate-400 space-y-1">
                <p className="text-xs font-semibold text-slate-600">No support tickets found</p>
                <p className="text-[11px] text-slate-400">
                  When you submit a ticket, tracking and replies appear here.
                </p>
              </div>
            ) : (
              myTickets.slice(0, 5).map((ticket) => {
                const statusChip = STATUS_CHIPS[ticket.status] || STATUS_CHIPS.open;
                const lastReply = ticket.replies && ticket.replies.length > 0
                  ? ticket.replies[ticket.replies.length - 1]
                  : null;

                return (
                  <div
                    key={ticket.id}
                    onClick={() => {
                      triggerHaptic('light');
                      setViewingSupportSystem(true);
                    }}
                    className="w-full min-h-[52px] px-3.5 py-2.5 flex items-center justify-between hover:bg-slate-50/70 active:bg-slate-100/60 transition-colors text-left cursor-pointer select-none"
                  >
                    <div className="min-w-0 pr-3">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-[11px] font-bold text-slate-500">
                          #{ticket.ticketNumber || ticket.id.slice(0, 6).toUpperCase()}
                        </span>
                        <span className="text-[12.5px] font-semibold text-[#04203F] truncate">
                          {ticket.subject}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 truncate mt-0.5">
                        {lastReply
                          ? `Last reply: ${lastReply.message}`
                          : `Opened on ${formatDate(ticket.createdAt)}`}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${statusChip.bg} ${statusChip.text} ${statusChip.border}`}>
                        {statusChip.label}
                      </span>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* SUPPORT TICKET FORM MODAL */}
      <AnimatePresence>
        {isTicketFormOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto border border-slate-200 shadow-2xl p-4 my-auto"
            >
              <SupportTicketForm
                user={user}
                initialCategory={ticketFormCategory}
                initialSubject={ticketFormInitialSubject}
                onSuccess={(ticketId) => {
                  setIsTicketFormOpen(false);
                  showToast('Support ticket submitted successfully!');
                  fetchTickets();
                }}
                onCancel={() => setIsTicketFormOpen(false)}
              />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* COMPLAINT / FEEDBACK FORM MODAL */}
      <AnimatePresence>
        {isFeedbackFormOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto border border-slate-200 shadow-2xl p-4 my-auto"
            >
              <FeedbackForm
                user={user}
                onSuccess={(refId) => {
                  setIsFeedbackFormOpen(false);
                  showToast('Feedback submitted. Thank you for helping us improve!');
                }}
                onCancel={() => setIsFeedbackFormOpen(false)}
              />
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
