import { 
  collection, doc, getDoc, setDoc, addDoc, 
  serverTimestamp, onSnapshot, query, orderBy, limit, increment 
} from 'firebase/firestore';
import { db } from './firebase';
import { UserProfile, ChatConversation, ChatMessage, ChatMessageType, UserRole } from '../types';

/**
 * Convert any Blob or File to a Base64 Data URL
 */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to convert blob to data URL'));
      }
    };
    reader.onerror = () => reject(new Error('Error reading audio or image blob'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Compress an image to max dimensions to keep payload tiny (<60KB)
 */
export async function compressImageToDataUrl(file: File | Blob, maxWidth = 800, quality = 0.75): Promise<string> {
  const dataUrl = await blobToDataUrl(file);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }
      if (height > maxWidth) {
        width = Math.round((width * maxWidth) / height);
        height = maxWidth;
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => {
      resolve(dataUrl);
    };
    img.src = dataUrl;
  });
}

/**
 * Get or create a chat room between a reseller and admin team
 */
export async function getOrCreateChatConversation(
  resellerId: string,
  resellerProfile?: UserProfile | null
): Promise<ChatConversation> {
  const chatId = `chat_${resellerId}`;
  const chatRef = doc(db, 'liveChats', chatId);

  try {
    const chatSnap = await getDoc(chatRef);
    if (chatSnap.exists()) {
      return { id: chatSnap.id, ...(chatSnap.data() as Omit<ChatConversation, 'id'>) };
    }
  } catch (e) {
    console.warn('Could not read existing chat, will initialize:', e);
  }

  // Fallback profile details
  let name = resellerProfile?.fullName || 'Reseller';
  let shopName = resellerProfile?.shopName || 'Shop';
  let photo = resellerProfile?.profilePhotoUrl || '';
  let mobile = resellerProfile?.mobile || '';
  let email = resellerProfile?.email || '';

  if (!resellerProfile) {
    try {
      const userSnap = await getDoc(doc(db, 'users', resellerId));
      if (userSnap.exists()) {
        const u = userSnap.data() as UserProfile;
        name = u.fullName || name;
        shopName = u.shopName || shopName;
        photo = u.profilePhotoUrl || photo;
        mobile = u.mobile || mobile;
        email = u.email || email;
      }
    } catch (e) {
      console.warn('Could not fetch reseller profile for chat init:', e);
    }
  }

  const initialData: Omit<ChatConversation, 'id'> = {
    resellerId,
    resellerName: name,
    resellerShopName: shopName,
    resellerPhotoUrl: photo,
    resellerMobile: mobile,
    resellerEmail: email,
    lastMessage: 'Chat initialized',
    lastMessageType: 'text',
    lastSenderId: resellerId,
    lastSenderName: name,
    lastSenderRole: 'reseller',
    lastMessageAt: serverTimestamp(),
    unreadAdminCount: 0,
    unreadResellerCount: 0,
    typingReseller: false,
    typingAdmin: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  await setDoc(chatRef, initialData, { merge: true });

  return {
    id: chatId,
    ...initialData,
  };
}

/**
 * Send a text message (with optional order or product link)
 */
export async function sendTextMessage(
  chatId: string,
  sender: UserProfile,
  text: string,
  options?: {
    order?: { id: string; orderNumber: string; status: string; totalAmount: number };
    product?: { id: string; name: string; imageUrl?: string; resellerPrice: number };
  }
): Promise<string> {
  const isReseller = sender.role === 'reseller';
  const resellerId = chatId.replace(/^chat_/, '');
  const chatRef = doc(db, 'liveChats', chatId);
  const messagesColRef = collection(db, 'liveChats', chatId, 'messages');

  let type: ChatMessageType = 'text';
  if (options?.order) type = 'order_link';
  else if (options?.product) type = 'product_link';

  const messageData: Record<string, any> = {
    chatId,
    senderId: sender.uid,
    senderName: sender.fullName,
    senderRole: sender.role,
    senderPhotoUrl: sender.profilePhotoUrl || '',
    text: text.trim(),
    type,
    read: false,
    readBy: [sender.uid],
    createdAt: serverTimestamp(),
  };

  if (options?.order) {
    messageData.orderId = options.order.id;
    messageData.orderNumber = options.order.orderNumber;
    messageData.orderStatus = options.order.status;
    messageData.orderAmount = options.order.totalAmount;
  }

  if (options?.product) {
    messageData.productId = options.product.id;
    messageData.productName = options.product.name;
    messageData.productImage = options.product.imageUrl || '';
    messageData.productPrice = options.product.resellerPrice;
  }

  const newDoc = await addDoc(messagesColRef, messageData);

  // Update conversation metadata & unread counters safely with setDoc(merge: true)
  const conversationUpdate: Record<string, any> = {
    resellerId,
    lastMessage: text.trim() || (type === 'order_link' ? `📦 Order #${options?.order?.orderNumber}` : `🛍️ Product: ${options?.product?.name}`),
    lastMessageType: type,
    lastSenderId: sender.uid,
    lastSenderName: sender.fullName,
    lastSenderRole: sender.role,
    lastMessageAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (isReseller) {
    conversationUpdate.resellerName = sender.fullName;
    conversationUpdate.resellerShopName = sender.shopName || 'Reseller Shop';
    conversationUpdate.resellerPhotoUrl = sender.profilePhotoUrl || '';
    conversationUpdate.resellerMobile = sender.mobile || '';
    conversationUpdate.resellerEmail = sender.email || '';
    conversationUpdate.unreadAdminCount = increment(1);
    conversationUpdate.typingReseller = false;
  } else {
    conversationUpdate.unreadResellerCount = increment(1);
    conversationUpdate.typingAdmin = false;
  }

  await setDoc(chatRef, conversationUpdate, { merge: true });

  return newDoc.id;
}

/**
 * Upload and send an image or voice recording (Instant, high-speed & 100% reliable)
 */
export async function sendMediaMessage(
  chatId: string,
  sender: UserProfile,
  blobOrFile: Blob | File,
  type: 'image' | 'voice',
  metadata?: {
    duration?: number;
    caption?: string;
    fileName?: string;
  }
): Promise<string> {
  const isReseller = sender.role === 'reseller';
  const resellerId = chatId.replace(/^chat_/, '');
  const chatRef = doc(db, 'liveChats', chatId);
  const messagesColRef = collection(db, 'liveChats', chatId, 'messages');

  let mediaUrl: string;
  if (type === 'image') {
    mediaUrl = await compressImageToDataUrl(blobOrFile, 800, 0.75);
  } else {
    // Voice audio recording
    mediaUrl = await blobToDataUrl(blobOrFile);
  }

  const messageData: Record<string, any> = {
    chatId,
    senderId: sender.uid,
    senderName: sender.fullName,
    senderRole: sender.role,
    senderPhotoUrl: sender.profilePhotoUrl || '',
    text: metadata?.caption || (type === 'voice' ? '🎤 Voice Message' : '📷 Photo'),
    type,
    mediaUrl,
    read: false,
    readBy: [sender.uid],
    createdAt: serverTimestamp(),
  };

  if (type === 'voice' && metadata?.duration) {
    messageData.mediaDuration = metadata.duration;
  }
  if (metadata?.fileName) {
    messageData.mediaName = metadata.fileName;
  }

  const newDoc = await addDoc(messagesColRef, messageData);

  // Update conversation
  const conversationUpdate: Record<string, any> = {
    resellerId,
    lastMessage: type === 'voice' ? '🎤 Voice message' : '📷 Photo attachment',
    lastMessageType: type,
    lastSenderId: sender.uid,
    lastSenderName: sender.fullName,
    lastSenderRole: sender.role,
    lastMessageAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (isReseller) {
    conversationUpdate.resellerName = sender.fullName;
    conversationUpdate.resellerShopName = sender.shopName || 'Reseller Shop';
    conversationUpdate.resellerPhotoUrl = sender.profilePhotoUrl || '';
    conversationUpdate.resellerMobile = sender.mobile || '';
    conversationUpdate.resellerEmail = sender.email || '';
    conversationUpdate.unreadAdminCount = increment(1);
    conversationUpdate.typingReseller = false;
  } else {
    conversationUpdate.unreadResellerCount = increment(1);
    conversationUpdate.typingAdmin = false;
  }

  await setDoc(chatRef, conversationUpdate, { merge: true });

  return newDoc.id;
}

/**
 * Mark messages in a chat as read by current user role
 */
export async function markChatAsRead(chatId: string, userRole: UserRole, userId: string): Promise<void> {
  const isReseller = userRole === 'reseller';
  const chatRef = doc(db, 'liveChats', chatId);

  try {
    if (isReseller) {
      await setDoc(chatRef, { unreadResellerCount: 0 }, { merge: true });
    } else {
      await setDoc(chatRef, { unreadAdminCount: 0 }, { merge: true });
    }
  } catch (err) {
    console.warn('Error marking chat as read:', err);
  }
}

/**
 * Set typing indicator status with automatic expiry
 */
export async function setChatTypingStatus(
  chatId: string,
  userRole: UserRole,
  isTyping: boolean,
  userName?: string
): Promise<void> {
  const isReseller = userRole === 'reseller';
  const chatRef = doc(db, 'liveChats', chatId);

  try {
    if (isReseller) {
      await setDoc(chatRef, {
        typingReseller: isTyping,
      }, { merge: true });
    } else {
      await setDoc(chatRef, {
        typingAdmin: isTyping,
        typingAdminName: isTyping ? (userName || 'Admin') : '',
      }, { merge: true });
    }
  } catch (e) {
    // ignore transient errors
  }
}

/**
 * Realtime subscription to conversations list (for Admin Inbox)
 */
export function subscribeToConversations(
  callback: (conversations: ChatConversation[]) => void
): () => void {
  const q = collection(db, 'liveChats');

  return onSnapshot(q, (snap) => {
    const list: ChatConversation[] = [];
    snap.forEach((d) => {
      list.push({ id: d.id, ...(d.data() as Omit<ChatConversation, 'id'>) });
    });

    // Sort by pinned first, then by lastMessageAt descending
    list.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;

      const timeA = a.lastMessageAt?.toDate ? a.lastMessageAt.toDate().getTime() : (a.lastMessageAt?.seconds ? a.lastMessageAt.seconds * 1000 : 0);
      const timeB = b.lastMessageAt?.toDate ? b.lastMessageAt.toDate().getTime() : (b.lastMessageAt?.seconds ? b.lastMessageAt.seconds * 1000 : 0);
      return timeB - timeA;
    });

    callback(list);
  }, (err) => {
    console.error('Error in subscribeToConversations:', err);
  });
}

/**
 * Realtime subscription to messages of a specific chat
 */
export function subscribeToChatMessages(
  chatId: string,
  callback: (messages: ChatMessage[]) => void
): () => void {
  const messagesRef = collection(db, 'liveChats', chatId, 'messages');
  const q = query(messagesRef, orderBy('createdAt', 'asc'), limit(200));

  return onSnapshot(q, (snap) => {
    const list: ChatMessage[] = [];
    snap.forEach((d) => {
      list.push({ id: d.id, ...(d.data() as Omit<ChatMessage, 'id'>) });
    });

    list.sort((a, b) => {
      const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : (typeof a.createdAt === 'string' ? new Date(a.createdAt).getTime() : 0));
      const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : (typeof b.createdAt === 'string' ? new Date(b.createdAt).getTime() : 0));
      return timeA - timeB;
    });

    callback(list);
  }, (err) => {
    console.error('Error in subscribeToChatMessages:', err);
  });
}

/**
 * Realtime subscription to single conversation document (metadata & typing)
 */
export function subscribeToChatConversation(
  chatId: string,
  callback: (conversation: ChatConversation | null) => void
): () => void {
  const chatRef = doc(db, 'liveChats', chatId);

  return onSnapshot(chatRef, (snap) => {
    if (snap.exists()) {
      callback({ id: snap.id, ...(snap.data() as Omit<ChatConversation, 'id'>) });
    } else {
      callback(null);
    }
  }, (err) => {
    console.error('Error in subscribeToChatConversation:', err);
  });
}

/**
 * Realtime total unread count for badge indicators
 */
export function subscribeToTotalUnreadChatCount(
  userRole: UserRole,
  userId: string,
  callback: (count: number) => void
): () => void {
  const isReseller = userRole === 'reseller';

  if (isReseller) {
    const chatRef = doc(db, 'liveChats', `chat_${userId}`);
    return onSnapshot(chatRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        callback(data.unreadResellerCount || 0);
      } else {
        callback(0);
      }
    }, () => callback(0));
  } else {
    // Admin / Super admin: sum of all unreadAdminCount across all chats
    const q = collection(db, 'liveChats');
    return onSnapshot(q, (snap) => {
      let sum = 0;
      snap.forEach((d) => {
        const data = d.data();
        sum += (data.unreadAdminCount || 0);
      });
      callback(sum);
    }, () => callback(0));
  }
}
