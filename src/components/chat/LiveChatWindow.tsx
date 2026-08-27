import React, { useState, useEffect, useRef } from 'react';
import { 
  UserProfile, ChatMessage, ChatConversation, UserRole 
} from '../../types';
import { 
  subscribeToChatMessages, subscribeToChatConversation, 
  sendTextMessage, sendMediaMessage, markChatAsRead, setChatTypingStatus,
  getOrCreateChatConversation
} from '../../lib/chatService';
import { VoiceRecorder } from './VoiceRecorder';
import { VoicePlayer } from './VoicePlayer';
import { OrderAttachmentPickerModal } from './OrderAttachmentPickerModal';
import { ProductAttachmentPickerModal } from './ProductAttachmentPickerModal';
import { 
  Send, Image as ImageIcon, Mic, Paperclip, ShoppingBag, Package, 
  X, Check, CheckCheck, Phone, MessageSquare, Sparkles, Loader2, 
  ArrowLeft, Store, Shield, MoreVertical, RefreshCw, ZoomIn, Download, ExternalLink
} from 'lucide-react';

interface LiveChatWindowProps {
  chatId: string;
  currentUser: UserProfile;
  partnerInfo?: {
    name: string;
    shopName?: string;
    photoUrl?: string;
    mobile?: string;
    role?: string;
  };
  onBack?: () => void;
  onOpenOrder?: (orderId: string) => void;
  onOpenProduct?: (productId: string) => void;
  className?: string;
}

const CANNED_RESPONSES = [
  '👋 আসসালামু আলাইকুম! আপনাকে কীভাবে সহযোগিতা করতে পারি?',
  '📦 আপনার অর্ডারটির স্ট্যাটাস আমরা চেক করছি, অনুগ্রহ করে কিছুক্ষণ অপেক্ষা করুন।',
  '✅ আপনার পেমেন্ট/উইথড্রয়াল রিকোয়েস্ট ভেরিফাই করা হয়েছে।',
  '🚚 আপনার পার্সেলটি কুরিয়ারে হস্তান্তর করা হয়েছে। ট্র্যাকিং কোড পেয়ে যাবেন।',
  '🙏 ধন্যবাদ আমাদের সাথে থাকার জন্য! যেকোনো প্রয়োজনে মেসেজ দিন।',
  '📞 বিস্তারিত জানতে আমাদের হটলাইনে কল করতে পারেন: 01722063777',
];

export const LiveChatWindow: React.FC<LiveChatWindowProps> = ({
  chatId,
  currentUser,
  partnerInfo,
  onBack,
  onOpenOrder,
  onOpenProduct,
  className = '',
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversation, setConversation] = useState<ChatConversation | null>(null);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [imageCaption, setImageCaption] = useState('');

  // Attachment Modals & Popovers
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showCannedMenu, setShowCannedMenu] = useState(false);
  const [showOrderPicker, setShowOrderPicker] = useState(false);
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const typingTimeoutRef = useRef<any>(null);

  const isReseller = currentUser.role === 'reseller';
  const otherIsTyping = isReseller ? conversation?.typingAdmin : conversation?.typingReseller;

  // 1. Subscribe to realtime messages & mark as read
  useEffect(() => {
    if (!chatId) return;

    if (isReseller) {
      getOrCreateChatConversation(currentUser.uid, currentUser).catch((e) => {
        console.warn('Initial chat creation check:', e);
      });
    }

    markChatAsRead(chatId, currentUser.role, currentUser.uid);

    const unsubMessages = subscribeToChatMessages(chatId, (msgList) => {
      setMessages(msgList);
      markChatAsRead(chatId, currentUser.role, currentUser.uid);
    });

    const unsubConv = subscribeToChatConversation(chatId, (conv) => {
      setConversation(conv);
    });

    return () => {
      unsubMessages();
      unsubConv();
      setChatTypingStatus(chatId, currentUser.role, false);
    };
  }, [chatId, currentUser.role, currentUser.uid, isReseller]);

  // Auto scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, otherIsTyping]);

  // Handle typing debounce
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const text = e.target.value;
    setInputText(text);

    if (chatId) {
      setChatTypingStatus(chatId, currentUser.role, true, currentUser.fullName);

      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        setChatTypingStatus(chatId, currentUser.role, false);
      }, 2000);
    }
  };

  // Send Text Message
  const handleSendText = async () => {
    if (!inputText.trim() || isSending) return;

    const textToSend = inputText.trim();
    setInputText('');
    setIsSending(true);

    try {
      await sendTextMessage(chatId, currentUser, textToSend);
      setChatTypingStatus(chatId, currentUser.role, false);
    } catch (err: any) {
      console.error('Failed to send text message:', err);
      setInputText(textToSend);
      alert(err.message || 'Message could not be sent. Please check your connection.');
    } finally {
      setIsSending(false);
    }
  };

  // Handle Image Selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedImageFile(file);
      const url = URL.createObjectURL(file);
      setImagePreviewUrl(url);
      setShowAttachMenu(false);
    }
  };

  // Send Image Message
  const handleSendImage = async () => {
    if (!selectedImageFile || isSending) return;

    setIsSending(true);
    try {
      await sendMediaMessage(chatId, currentUser, selectedImageFile, 'image', {
        caption: imageCaption.trim() || undefined,
        fileName: selectedImageFile.name,
      });

      setSelectedImageFile(null);
      setImagePreviewUrl(null);
      setImageCaption('');
    } catch (err) {
      console.error('Failed to send image:', err);
      alert('Could not upload photo.');
    } finally {
      setIsSending(false);
    }
  };

  // Send Voice Recording
  const handleSendVoice = async (audioBlob: Blob, duration: number) => {
    setIsRecordingVoice(false);
    setIsSending(true);
    try {
      await sendMediaMessage(chatId, currentUser, audioBlob, 'voice', {
        duration,
      });
    } catch (err) {
      console.error('Failed to send voice note:', err);
      alert('Could not upload voice message.');
    } finally {
      setIsSending(false);
    }
  };

  // Send Order Card Attachment
  const handleSelectOrder = async (order: { id: string; orderNumber: string; status: string; totalAmount: number }) => {
    setIsSending(true);
    try {
      await sendTextMessage(chatId, currentUser, `📦 Attached Order #${order.orderNumber}`, {
        order,
      });
    } catch (err) {
      console.error('Failed to attach order:', err);
    } finally {
      setIsSending(false);
    }
  };

  // Send Product Card Attachment
  const handleSelectProduct = async (product: { id: string; name: string; imageUrl?: string; resellerPrice: number }) => {
    setIsSending(true);
    try {
      await sendTextMessage(chatId, currentUser, `🛍️ Attached Product: ${product.name}`, {
        product,
      });
    } catch (err) {
      console.error('Failed to attach product:', err);
    } finally {
      setIsSending(false);
    }
  };

  // Format message time (e.g. 10:45 AM)
  const formatMsgTime = (timestamp: any) => {
    if (!timestamp) return '';
    let d: Date;
    if (timestamp.toDate) d = timestamp.toDate();
    else if (timestamp.seconds) d = new Date(timestamp.seconds * 1000);
    else d = new Date(timestamp);

    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const partnerDisplayName = partnerInfo?.name || conversation?.resellerName || 'Sky Admin Support';
  const partnerShopName = partnerInfo?.shopName || conversation?.resellerShopName || (isReseller ? 'Official Support Team' : 'Reseller Shop');
  const partnerMobile = partnerInfo?.mobile || conversation?.resellerMobile;
  const partnerPhoto = partnerInfo?.photoUrl || conversation?.resellerPhotoUrl;

  return (
    <div className={`flex flex-col h-full bg-slate-100 rounded-2xl overflow-hidden border border-slate-200 shadow-sm relative ${className}`}>
      {/* 1. CHAT HEADER */}
      <div className="bg-slate-900 text-white px-4 py-3 flex items-center justify-between shadow-md shrink-0 z-10">
        <div className="flex items-center gap-3 min-w-0">
          {onBack && (
            <button
              onClick={onBack}
              className="p-1.5 -ml-1 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
              title="Back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}

          <div className="relative shrink-0">
            {partnerPhoto ? (
              <img
                src={partnerPhoto}
                alt={partnerDisplayName}
                className="w-10 h-10 rounded-full object-cover border border-slate-700"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white font-bold text-sm shadow-inner">
                {isReseller ? <Shield className="w-5 h-5" /> : partnerDisplayName.charAt(0)}
              </div>
            )}
            <div className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 ring-2 ring-slate-900" />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h3 className="font-bold text-sm text-white truncate">{partnerDisplayName}</h3>
              {isReseller ? (
                <span className="bg-blue-500/20 text-blue-300 text-[10px] font-bold px-1.5 py-0.2 rounded-md border border-blue-400/30">
                  ADMIN
                </span>
              ) : null}
            </div>
            <p className="text-[11px] text-slate-400 truncate">
              {otherIsTyping ? (
                <span className="text-emerald-400 font-semibold animate-pulse">Typing message...</span>
              ) : (
                partnerShopName
              )}
            </p>
          </div>
        </div>

        {/* Header Action Shortcuts */}
        <div className="flex items-center gap-2 shrink-0">
          {partnerMobile && (
            <>
              <a
                href={`tel:${partnerMobile}`}
                className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition-colors cursor-pointer"
                title={`Call ${partnerMobile}`}
              >
                <Phone className="w-4 h-4 text-emerald-400" />
              </a>
              <a
                href={`https://wa.me/${partnerMobile.replace(/[^0-9]/g, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl transition-colors cursor-pointer"
                title="WhatsApp Direct"
              >
                <MessageSquare className="w-4 h-4" />
              </a>
            </>
          )}

          {!isReseller && (
            <button
              onClick={() => setShowCannedMenu(!showCannedMenu)}
              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-300 rounded-xl text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
              title="Quick Canned Replies"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Replies</span>
            </button>
          )}
        </div>
      </div>

      {/* Canned Responses Dropdown Modal */}
      {showCannedMenu && (
        <div className="absolute top-16 right-4 z-30 bg-white rounded-2xl shadow-2xl border border-slate-200 p-2 max-w-sm w-full animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="flex items-center justify-between p-2 border-b border-slate-100">
            <span className="font-bold text-xs text-slate-800 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              Quick Canned Responses
            </span>
            <button
              onClick={() => setShowCannedMenu(false)}
              className="text-slate-400 hover:text-slate-600 p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="max-h-60 overflow-y-auto p-1 space-y-1">
            {CANNED_RESPONSES.map((res, i) => (
              <button
                key={i}
                onClick={() => {
                  setInputText(res);
                  setShowCannedMenu(false);
                }}
                className="w-full text-left p-2 hover:bg-blue-50 text-xs text-slate-700 rounded-xl transition-colors leading-relaxed"
              >
                {res}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 2. CHAT MESSAGES BODY */}
      <div 
        className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#e5ddd5]/30 relative"
        style={{ backgroundImage: 'radial-gradient(#cbd5e1 1px, transparent 1px)', backgroundSize: '16px 16px' }}
      >
        {/* Welcome Notice Bubble */}
        <div className="flex justify-center my-2">
          <div className="bg-slate-900/80 backdrop-blur-xs text-white text-[11px] font-medium px-3.5 py-1.5 rounded-full shadow-xs flex items-center gap-2 max-w-md text-center">
            <Shield className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <span>Messages are encrypted & saved securely in realtime</span>
          </div>
        </div>

        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400 space-y-2">
            <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
              <MessageSquare className="w-6 h-6" />
            </div>
            <p className="text-xs font-bold text-slate-600">No messages yet</p>
            <p className="text-[11px] text-slate-400 text-center max-w-xs">
              Say hello or ask any question regarding orders, payouts, or inventory.
            </p>
          </div>
        )}

        {messages.map((msg) => {
          const isSelf = msg.senderId === currentUser.uid;

          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isSelf ? 'items-end' : 'items-start'} animate-in fade-in slide-in-from-bottom-1 duration-150`}
            >
              {/* Sender Tag if Admin */}
              {!isSelf && msg.senderRole !== 'reseller' && (
                <span className="text-[10px] font-bold text-blue-600 mb-0.5 ml-2">
                  {msg.senderName} (Support)
                </span>
              )}

              {/* Message Bubble */}
              <div
                className={`relative max-w-[85%] sm:max-w-[70%] rounded-2xl p-3 shadow-xs text-xs space-y-1.5 ${
                  isSelf
                    ? 'bg-emerald-600 text-white rounded-br-xs'
                    : 'bg-white text-slate-900 border border-slate-200/80 rounded-bl-xs'
                }`}
              >
                {/* A. IMAGE MESSAGE */}
                {msg.type === 'image' && msg.mediaUrl && (
                  <div className="space-y-1.5">
                    <div 
                      onClick={() => setLightboxImage(msg.mediaUrl || null)}
                      className="rounded-xl overflow-hidden cursor-pointer relative group border border-black/10 bg-slate-950/20 max-h-72"
                    >
                      <img
                        src={msg.mediaUrl}
                        alt="Photo attachment"
                        className="w-full h-auto object-cover group-hover:scale-105 transition-transform duration-200"
                        loading="lazy"
                      />
                      <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white gap-2">
                        <ZoomIn className="w-5 h-5" />
                        <span className="text-[10px] font-bold">Zoom</span>
                      </div>
                    </div>
                    {msg.text && msg.text !== '📷 Photo' && (
                      <p className="leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                    )}
                  </div>
                )}

                {/* B. VOICE MESSAGE */}
                {msg.type === 'voice' && msg.mediaUrl && (
                  <VoicePlayer
                    audioUrl={msg.mediaUrl}
                    duration={msg.mediaDuration || 0}
                    isSelf={isSelf}
                  />
                )}

                {/* C. ORDER LINK CARD */}
                {msg.type === 'order_link' && msg.orderId && (
                  <div className={`p-2.5 rounded-xl border space-y-1.5 ${
                    isSelf ? 'bg-emerald-700/40 border-emerald-500/50 text-white' : 'bg-blue-50/70 border-blue-200 text-slate-900'
                  }`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 font-extrabold text-xs">
                        <ShoppingBag className="w-4 h-4 text-amber-300" />
                        <span>Order #{msg.orderNumber || msg.orderId.slice(0, 8)}</span>
                      </div>
                      <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md uppercase ${
                        isSelf ? 'bg-white/20 text-white' : 'bg-blue-600 text-white'
                      }`}>
                        {msg.orderStatus || 'ACTIVE'}
                      </span>
                    </div>

                    {msg.orderAmount ? (
                      <div className="text-[11px] font-semibold opacity-90">
                        Total Amount: ৳{msg.orderAmount.toLocaleString()}
                      </div>
                    ) : null}

                    {onOpenOrder && (
                      <button
                        type="button"
                        onClick={() => onOpenOrder(msg.orderId!)}
                        className={`w-full py-1 text-center font-bold text-[11px] rounded-lg transition-colors flex items-center justify-center gap-1 cursor-pointer ${
                          isSelf 
                            ? 'bg-white/20 hover:bg-white/30 text-white' 
                            : 'bg-blue-600 hover:bg-blue-700 text-white'
                        }`}
                      >
                        <span>View Order Details</span>
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                )}

                {/* D. PRODUCT LINK CARD */}
                {msg.type === 'product_link' && msg.productId && (
                  <div className={`p-2.5 rounded-xl border space-y-1.5 ${
                    isSelf ? 'bg-emerald-700/40 border-emerald-500/50 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
                  }`}>
                    <div className="flex items-center gap-2.5">
                      {msg.productImage ? (
                        <img
                          src={msg.productImage}
                          alt={msg.productName}
                          className="w-12 h-12 rounded-lg object-cover border border-white/20 shrink-0"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-lg bg-slate-200 flex items-center justify-center text-slate-500 shrink-0">
                          <Package className="w-5 h-5" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="font-bold text-xs truncate">{msg.productName}</p>
                        {msg.productPrice ? (
                          <p className="text-[11px] font-extrabold text-amber-300">
                            Reseller: ৳{msg.productPrice.toLocaleString()}
                          </p>
                        ) : null}
                      </div>
                    </div>

                    {onOpenProduct && (
                      <button
                        type="button"
                        onClick={() => onOpenProduct(msg.productId!)}
                        className={`w-full py-1 text-center font-bold text-[11px] rounded-lg transition-colors flex items-center justify-center gap-1 cursor-pointer ${
                          isSelf 
                            ? 'bg-white/20 hover:bg-white/30 text-white' 
                            : 'bg-slate-900 hover:bg-slate-800 text-white'
                        }`}
                      >
                        <span>View Product Specs</span>
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                )}

                {/* E. STANDARD TEXT */}
                {msg.type === 'text' && (
                  <p className="leading-relaxed whitespace-pre-wrap select-text break-words">
                    {msg.text}
                  </p>
                )}

                {/* Timestamp & Read Receipt Checkmarks */}
                <div className={`flex items-center justify-end gap-1 text-[9px] ${
                  isSelf ? 'text-emerald-100' : 'text-slate-400'
                }`}>
                  <span>{formatMsgTime(msg.createdAt)}</span>
                  {isSelf && (
                    <span>
                      {msg.read ? (
                        <CheckCheck className="w-3.5 h-3.5 text-cyan-200 inline" />
                      ) : (
                        <Check className="w-3.5 h-3.5 inline opacity-70" />
                      )}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {/* Realtime Partner Typing Indicator Bubble */}
        {otherIsTyping && (
          <div className="flex items-center gap-1.5 p-2 bg-white rounded-2xl shadow-xs border border-slate-200 max-w-[120px] animate-pulse">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: '0ms' }} />
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: '150ms' }} />
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: '300ms' }} />
            <span className="text-[10px] font-bold text-slate-500 ml-1">typing</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 3. IMAGE PREVIEW MODAL / DRAWER BEFORE SENDING */}
      {imagePreviewUrl && (
        <div className="bg-slate-900 p-3 border-t border-slate-800 text-white flex items-center gap-3 animate-in slide-in-from-bottom-2 duration-150">
          <div className="relative w-16 h-16 rounded-xl overflow-hidden border border-slate-700 shrink-0">
            <img src={imagePreviewUrl} alt="Preview" className="w-full h-full object-cover" />
            <button
              onClick={() => {
                setImagePreviewUrl(null);
                setSelectedImageFile(null);
              }}
              className="absolute top-1 right-1 bg-black/70 hover:bg-black text-white p-0.5 rounded-full"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
          <div className="flex-1 flex items-center gap-2">
            <input
              type="text"
              value={imageCaption}
              onChange={(e) => setImageCaption(e.target.value)}
              placeholder="Add photo caption..."
              className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <button
              onClick={handleSendImage}
              disabled={isSending}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-extrabold text-xs rounded-xl flex items-center gap-1.5 shadow-md transition-all cursor-pointer shrink-0"
            >
              {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              <span>Send</span>
            </button>
          </div>
        </div>
      )}

      {/* 4. CHAT INPUT FOOTER */}
      <div className="bg-white p-2.5 sm:p-3 border-t border-slate-200 shrink-0 relative">
        {isRecordingVoice ? (
          <VoiceRecorder
            onSendVoice={handleSendVoice}
            onCancel={() => setIsRecordingVoice(false)}
          />
        ) : (
          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Attachment Dropup / Button */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowAttachMenu(!showAttachMenu)}
                className="p-2.5 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                title="Attach Photo, Order or Product"
              >
                <Paperclip className="w-5 h-5" />
              </button>

              {/* Hidden File Input for Image */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
              />

              {showAttachMenu && (
                <div className="absolute bottom-12 left-0 z-20 bg-white rounded-2xl shadow-2xl border border-slate-200 p-2 w-48 space-y-1 animate-in fade-in slide-in-from-bottom-2 duration-150">
                  <button
                    onClick={() => {
                      fileInputRef.current?.click();
                      setShowAttachMenu(false);
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                  >
                    <ImageIcon className="w-4 h-4 text-emerald-600" />
                    <span>Upload Photo</span>
                  </button>
                  <button
                    onClick={() => {
                      setShowOrderPicker(true);
                      setShowAttachMenu(false);
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                  >
                    <ShoppingBag className="w-4 h-4 text-blue-600" />
                    <span>Share Order Link</span>
                  </button>
                  <button
                    onClick={() => {
                      setShowProductPicker(true);
                      setShowAttachMenu(false);
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                  >
                    <Package className="w-4 h-4 text-amber-600" />
                    <span>Share Product</span>
                  </button>
                </div>
              )}
            </div>

            {/* Text Input Field */}
            <input
              type="text"
              value={inputText}
              onChange={handleInputChange}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendText();
                }
              }}
              placeholder="Type a message or voice note..."
              className="flex-1 bg-slate-100 hover:bg-slate-50 focus:bg-white border border-slate-200 focus:border-emerald-500 rounded-2xl px-4 py-2.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all"
            />

            {/* Mic / Voice Record Toggle Button */}
            {!inputText.trim() ? (
              <button
                type="button"
                onClick={() => setIsRecordingVoice(true)}
                className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-emerald-600 rounded-xl transition-colors cursor-pointer shrink-0"
                title="Record Voice Note"
              >
                <Mic className="w-5 h-5" />
              </button>
            ) : (
              /* Send Text Button */
              <button
                type="button"
                onClick={handleSendText}
                disabled={isSending}
                className="p-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl shadow-md transition-transform active:scale-95 cursor-pointer shrink-0"
                title="Send Message"
              >
                {isSending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
              </button>
            )}
          </div>
        )}
      </div>

      {/* 5. LIGHTBOX IMAGE VIEWER MODAL */}
      {lightboxImage && (
        <div 
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setLightboxImage(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] flex flex-col items-center">
            <img
              src={lightboxImage}
              alt="Enlarged view"
              className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl"
            />
            <div className="mt-3 flex items-center gap-3">
              <a
                href={lightboxImage}
                target="_blank"
                rel="noreferrer"
                download="chat_image.jpg"
                onClick={(e) => e.stopPropagation()}
                className="px-4 py-2 bg-white/20 hover:bg-white/30 text-white font-bold text-xs rounded-xl flex items-center gap-2 backdrop-blur-xs"
              >
                <Download className="w-4 h-4" />
                <span>Open Full Original</span>
              </a>
              <button
                onClick={() => setLightboxImage(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-xl"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. ORDER PICKER MODAL */}
      <OrderAttachmentPickerModal
        isOpen={showOrderPicker}
        onClose={() => setShowOrderPicker(false)}
        user={currentUser}
        onSelectOrder={handleSelectOrder}
      />

      {/* 7. PRODUCT PICKER MODAL */}
      <ProductAttachmentPickerModal
        isOpen={showProductPicker}
        onClose={() => setShowProductPicker(false)}
        onSelectProduct={handleSelectProduct}
      />
    </div>
  );
};
