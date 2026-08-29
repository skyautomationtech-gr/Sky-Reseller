import React, { useState, useEffect } from 'react';
import { UserProfile, ChatConversation, Wallet } from '../../types';
import { formatResellerId } from '../../lib/resellerIdHelper';
import { subscribeToConversations, getOrCreateChatConversation } from '../../lib/chatService';
import { LiveChatWindow } from './LiveChatWindow';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { 
  MessageSquare, Search, Phone, Mail, Store, User, 
  ShoppingBag, Wallet as WalletIcon, Shield, Sparkles, Filter, 
  Clock, CheckCheck, ChevronRight, ArrowLeft, Loader2, RefreshCw 
} from 'lucide-react';

interface AdminLiveChatHubProps {
  user: UserProfile;
  initialResellerId?: string;
  onOpenOrder?: (orderId: string) => void;
  onOpenProduct?: (productId: string) => void;
}

export const AdminLiveChatHub: React.FC<AdminLiveChatHubProps> = ({
  user,
  initialResellerId,
  onOpenOrder,
  onOpenProduct,
}) => {
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [selectedChat, setSelectedChat] = useState<ChatConversation | null>(null);
  const [search, setSearch] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [loading, setLoading] = useState(true);

  // Selected Reseller Quick Details
  const [selectedResellerProfile, setSelectedResellerProfile] = useState<UserProfile | null>(null);
  const [selectedResellerWallet, setSelectedResellerWallet] = useState<number | null>(null);
  const [selectedResellerOrdersCount, setSelectedResellerOrdersCount] = useState<number | null>(null);
  const [showResellerDetails, setShowResellerDetails] = useState(true);

  // Realtime subscription to all conversations
  useEffect(() => {
    const unsubscribe = subscribeToConversations((convList) => {
      setConversations(convList);
      setLoading(false);

      if (initialResellerId && !selectedChat) {
        const found = convList.find((c) => c.resellerId === initialResellerId);
        if (found) setSelectedChat(found);
      } else if (selectedChat) {
        const updated = convList.find((c) => c.id === selectedChat.id);
        if (updated) setSelectedChat(updated);
      }
    });

    return () => unsubscribe();
  }, [initialResellerId]);

  // Load Reseller Quick Details when selected
  useEffect(() => {
    if (!selectedChat) {
      setSelectedResellerProfile(null);
      setSelectedResellerWallet(null);
      setSelectedResellerOrdersCount(null);
      return;
    }

    const fetchResellerMeta = async () => {
      try {
        const [uSnap, wSnap, oSnap] = await Promise.all([
          getDoc(doc(db, 'users', selectedChat.resellerId)),
          getDoc(doc(db, 'wallets', selectedChat.resellerId)),
          getDocs(query(collection(db, 'orders'), where('resellerId', '==', selectedChat.resellerId))),
        ]);

        if (uSnap.exists()) {
          setSelectedResellerProfile(uSnap.data() as UserProfile);
        }
        if (wSnap.exists()) {
          const w = wSnap.data() as Wallet;
          setSelectedResellerWallet(w.balance || 0);
        }
        setSelectedResellerOrdersCount(oSnap.size);
      } catch (err) {
        console.warn('Error fetching reseller quick meta:', err);
      }
    };

    fetchResellerMeta();
  }, [selectedChat?.resellerId]);

  const filteredConversations = conversations.filter((c) => {
    if (unreadOnly && c.unreadAdminCount <= 0) return false;
    if (!search.trim()) return true;

    const term = search.toLowerCase();
    return (
      c.resellerName.toLowerCase().includes(term) ||
      (c.resellerShopName && c.resellerShopName.toLowerCase().includes(term)) ||
      (c.resellerMobile && c.resellerMobile.includes(term)) ||
      (c.lastMessage && c.lastMessage.toLowerCase().includes(term))
    );
  });

  const totalUnread = conversations.reduce((acc, c) => acc + (c.unreadAdminCount || 0), 0);

  const formatRelativeTime = (timestamp: any) => {
    if (!timestamp) return '';
    let d: Date;
    if (timestamp.toDate) d = timestamp.toDate();
    else if (timestamp.seconds) d = new Date(timestamp.seconds * 1000);
    else d = new Date(timestamp);

    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMins / 60);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  return (
    <div className="h-[calc(100vh-8.5rem)] flex flex-col bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {/* 2-Column Responsive Layout */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left Side: Reseller Conversations List */}
        <div className={`w-full md:w-80 lg:w-96 flex flex-col border-r border-slate-200 bg-slate-50/50 shrink-0 ${
          selectedChat ? 'hidden md:flex' : 'flex'
        }`}>
          {/* Header */}
          <div className="p-4 border-b border-slate-200 bg-white space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-sm">
                  <MessageSquare className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="font-extrabold text-sm text-slate-900">Live Support Chat</h2>
                  <p className="text-[11px] text-slate-500">Realtime direct messaging</p>
                </div>
              </div>

              {totalUnread > 0 && (
                <span className="bg-rose-500 text-white font-extrabold text-xs px-2.5 py-0.5 rounded-full shadow-xs animate-pulse">
                  {totalUnread} Unread
                </span>
              )}
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search reseller by name, shop, phone..."
                className="w-full pl-9 pr-3 py-2 bg-slate-100 hover:bg-slate-50 focus:bg-white border border-slate-200 focus:border-blue-500 rounded-xl text-xs focus:outline-none transition-all"
              />
            </div>

            {/* Filter Toggle */}
            <div className="flex items-center justify-between text-xs">
              <button
                onClick={() => setUnreadOnly(!unreadOnly)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold transition-colors cursor-pointer ${
                  unreadOnly
                    ? 'bg-rose-50 border border-rose-200 text-rose-700'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                <Filter className="w-3.5 h-3.5" />
                <span>Unread Only</span>
              </button>

              <span className="text-[11px] text-slate-400 font-semibold">
                {filteredConversations.length} Reseller{filteredConversations.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>

          {/* Conversations Scrollable List */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100 p-2 space-y-1">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2">
                <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                <span className="text-xs">Loading conversations...</span>
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className="text-center py-16 text-slate-400 space-y-1 px-4">
                <MessageSquare className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                <p className="text-xs font-bold text-slate-600">No active chats found</p>
                <p className="text-[11px]">When resellers send a message, they will appear here instantly.</p>
              </div>
            ) : (
              filteredConversations.map((conv) => {
                const isSelected = selectedChat?.id === conv.id;
                const hasUnread = conv.unreadAdminCount > 0;

                return (
                  <div
                    key={conv.id}
                    onClick={() => setSelectedChat(conv)}
                    className={`p-3 rounded-2xl transition-all cursor-pointer flex items-center justify-between gap-3 group ${
                      isSelected
                        ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                        : hasUnread
                        ? 'bg-rose-50/70 hover:bg-rose-100/70 border border-rose-200/80'
                        : 'bg-white hover:bg-slate-100/80 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Avatar */}
                      <div className="relative shrink-0">
                        {conv.resellerPhotoUrl ? (
                          <img
                            src={conv.resellerPhotoUrl}
                            alt={conv.resellerName}
                            className={`w-11 h-11 rounded-full object-cover border ${
                              isSelected ? 'border-white/30' : 'border-slate-200'
                            }`}
                          />
                        ) : (
                          <div className={`w-11 h-11 rounded-full flex items-center justify-center font-extrabold text-sm uppercase ${
                            isSelected ? 'bg-white/20 text-white' : 'bg-blue-100 text-blue-700'
                          }`}>
                            {conv.resellerName.charAt(0)}
                          </div>
                        )}
                        <div className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 ring-2 ring-white" />
                      </div>

                      {/* Info & Last Message Snippet */}
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex items-center gap-1.5">
                          <h4 className={`font-extrabold text-xs truncate ${
                            isSelected ? 'text-white' : 'text-slate-900'
                          }`}>
                            {conv.resellerName}
                          </h4>
                        </div>

                        <p className={`text-[11px] truncate ${
                          isSelected ? 'text-blue-100' : 'text-slate-500'
                        }`}>
                          {conv.resellerShopName || 'Reseller Shop'}
                        </p>

                        <p className={`text-[11px] truncate font-medium ${
                          isSelected
                            ? 'text-white/80'
                            : hasUnread
                            ? 'text-rose-700 font-bold'
                            : 'text-slate-400'
                        }`}>
                          {conv.typingReseller ? (
                            <span className="text-emerald-500 font-bold animate-pulse">Typing...</span>
                          ) : (
                            conv.lastMessage || 'No messages yet'
                          )}
                        </p>
                      </div>
                    </div>

                    {/* Metadata (Time & Unread Badge) */}
                    <div className="text-right shrink-0 flex flex-col items-end gap-1.5">
                      <span className={`text-[10px] ${
                        isSelected ? 'text-blue-100' : 'text-slate-400'
                      }`}>
                        {formatRelativeTime(conv.lastMessageAt)}
                      </span>

                      {hasUnread && !isSelected && (
                        <span className="bg-rose-500 text-white font-extrabold text-[10px] px-2 py-0.5 rounded-full shadow-xs animate-bounce">
                          {conv.unreadAdminCount}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Side: Active Chat Window + Collapsible Reseller Profile */}
        <div className={`flex-1 flex overflow-hidden ${
          !selectedChat ? 'hidden md:flex' : 'flex'
        }`}>
          {selectedChat ? (
            <div className="flex-1 flex h-full overflow-hidden">
              {/* Live Chat Window Container */}
              <div className="flex-1 flex flex-col h-full overflow-hidden">
                <LiveChatWindow
                  chatId={selectedChat.id}
                  currentUser={user}
                  partnerInfo={{
                    name: selectedChat.resellerName,
                    shopName: selectedChat.resellerShopName,
                    photoUrl: selectedChat.resellerPhotoUrl,
                    mobile: selectedChat.resellerMobile,
                    role: 'reseller',
                  }}
                  onBack={() => setSelectedChat(null)}
                  onOpenOrder={onOpenOrder}
                  onOpenProduct={onOpenProduct}
                  className="rounded-none border-none h-full shadow-none"
                />
              </div>

              {/* Collapsible Reseller Quick Info Drawer (Desktop) */}
              <div className="hidden xl:flex w-72 flex-col border-l border-slate-200 bg-slate-50/50 p-4 space-y-4 shrink-0 overflow-y-auto">
                <div className="text-center space-y-2 pb-3 border-b border-slate-200">
                  {selectedChat.resellerPhotoUrl ? (
                    <img
                      src={selectedChat.resellerPhotoUrl}
                      alt={selectedChat.resellerName}
                      className="w-16 h-16 rounded-full object-cover mx-auto border-2 border-white shadow-md"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-blue-600 text-white font-extrabold text-xl flex items-center justify-center mx-auto shadow-md">
                      {selectedChat.resellerName.charAt(0)}
                    </div>
                  )}
                  <div>
                    <h3 className="font-extrabold text-sm text-slate-900">{selectedChat.resellerName}</h3>
                    <p className="text-xs text-slate-500 flex items-center justify-center gap-1">
                      <Store className="w-3.5 h-3.5 text-blue-600" />
                      <span>{selectedChat.resellerShopName || 'Reseller'}</span>
                    </p>
                    <span className="inline-block mt-1 font-mono text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                      ID: {formatResellerId(selectedResellerProfile || selectedChat.resellerId)}
                    </span>
                  </div>
                </div>

                {/* Reseller Quick Contact Buttons */}
                {selectedChat.resellerMobile && (
                  <div className="grid grid-cols-2 gap-2">
                    <a
                      href={`tel:${selectedChat.resellerMobile}`}
                      className="p-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <Phone className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Call Now</span>
                    </a>
                    <a
                      href={`https://wa.me/${selectedChat.resellerMobile.replace(/[^0-9]/g, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>WhatsApp</span>
                    </a>
                  </div>
                )}

                {/* Key Account Stats */}
                <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs space-y-2.5">
                  <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider block">
                    Account Overview
                  </span>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 flex items-center gap-1.5">
                      <WalletIcon className="w-3.5 h-3.5 text-amber-500" />
                      Wallet Balance:
                    </span>
                    <span className="font-extrabold text-slate-900">
                      ৳{(selectedResellerWallet ?? 0).toLocaleString()}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 flex items-center gap-1.5">
                      <ShoppingBag className="w-3.5 h-3.5 text-blue-500" />
                      Total Orders:
                    </span>
                    <span className="font-extrabold text-slate-900">
                      {selectedResellerOrdersCount ?? 0} Orders
                    </span>
                  </div>

                  {selectedResellerProfile?.district && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500">Location:</span>
                      <span className="font-semibold text-slate-800">
                        {selectedResellerProfile.district}, {selectedResellerProfile.division}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* No Chat Selected Placeholder */
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-slate-50/30">
              <div className="w-16 h-16 rounded-2xl bg-blue-100 flex items-center justify-center text-blue-600 mb-3 shadow-inner">
                <MessageSquare className="w-8 h-8" />
              </div>
              <h3 className="text-base font-extrabold text-slate-900 mb-1">
                Select a Reseller Conversation
              </h3>
              <p className="text-xs text-slate-500 max-w-sm leading-relaxed">
                Choose a conversation from the left sidebar to start live chatting, reply to voice messages, or share order updates.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
