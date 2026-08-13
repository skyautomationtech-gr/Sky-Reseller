import React, { useState, useEffect, useRef } from 'react';
import { collection, getDocs, doc, setDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { UserProfile, Notice } from '../../types';
import { Bell, Check, ChevronRight, X, Sparkles, AlertCircle } from 'lucide-react';

import { requestAndRegisterPushNotifications } from '../../lib/pushNotifications';

interface NotificationBellDropdownProps {
  user: UserProfile;
  onNavigateNotifications?: () => void;
}

export const NotificationBellDropdown: React.FC<NotificationBellDropdownProps> = ({
  user,
  onNavigateNotifications,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [readNoticeIds, setReadNoticeIds] = useState<Set<string>>(new Set());
  const [permissionPromptVisible, setPermissionPromptVisible] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Check Notification permissions
    if ('Notification' in window && Notification.permission === 'default') {
      setPermissionPromptVisible(true);
    }

    // Subscribe to realtime notices
    const unsubscribeNotices = onSnapshot(collection(db, 'notices'), (snapshot) => {
      const nList: Notice[] = [];
      snapshot.forEach((d) => {
        const n = Object.assign({ id: d.id }, d.data()) as unknown as Notice;
        if (n.targetAudience === 'all' || n.targetResellerId === user.uid) {
          nList.push(n);
        }
      });

      nList.sort((a, b) => {
        const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt || 0).getTime();
        const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt || 0).getTime();
        return timeB - timeA;
      });

      setNotices(nList);
    });

    // Fetch read list
    fetchReads();

    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      unsubscribeNotices();
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [user.uid]);

  const fetchReads = async () => {
    try {
      const readsSnap = await getDocs(collection(db, 'noticeReads'));
      const reads = new Set<string>();
      readsSnap.forEach((d) => {
        const data = d.data();
        if (data.resellerId === user.uid) {
          reads.add(data.noticeId);
        }
      });
      setReadNoticeIds(reads);
    } catch (err) {
      console.error('Error fetching read notices:', err);
    }
  };

  const requestPushPermission = async () => {
    await requestAndRegisterPushNotifications(user.uid);
    setPermissionPromptVisible(false);
  };

  const markAsRead = async (noticeId: string) => {
    if (readNoticeIds.has(noticeId)) return;
    try {
      const readDocId = `${user.uid}_${noticeId}`;
      await setDoc(doc(db, 'noticeReads', readDocId), {
        noticeId,
        resellerId: user.uid,
        readAt: serverTimestamp(),
      });
      setReadNoticeIds((prev) => new Set(prev).add(noticeId));
    } catch (err) {
      console.error('Error marking as read:', err);
    }
  };

  const unreadCount = notices.filter((n) => !readNoticeIds.has(n.id)).length;

  return (
    <div ref={dropdownRef} className="relative">
      {/* Bell Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-full transition-colors relative"
        title="Notifications"
      >
        <Bell className="w-5 h-5 text-slate-700" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 bg-rose-600 text-white text-[9px] font-black rounded-full flex items-center justify-center border border-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Card */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-150">
          {/* Header */}
          <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-blue-400" />
              <span className="font-bold text-xs">Announcements ({unreadCount} unread)</span>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-slate-400 hover:text-white p-1 rounded-lg"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Browser Notification Permission Banner */}
          {permissionPromptVisible && (
            <div className="p-3 bg-blue-50 border-b border-blue-100 text-xs flex items-center justify-between gap-2">
              <div className="text-[11px] text-blue-900 font-medium leading-tight">
                Enable browser notifications to get real-time product & offer alerts.
              </div>
              <button
                onClick={requestPushPermission}
                className="px-2.5 py-1 bg-blue-600 text-white font-bold text-[10px] rounded-lg hover:bg-blue-500 shrink-0 shadow-xs"
              >
                Enable
              </button>
            </div>
          )}

          {/* List */}
          <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
            {notices.length === 0 ? (
              <div className="p-6 text-center text-slate-400 text-xs font-medium">
                No new notifications available.
              </div>
            ) : (
              notices.slice(0, 6).map((n) => {
                const isRead = readNoticeIds.has(n.id);
                return (
                  <div
                    key={n.id}
                    onClick={() => {
                      markAsRead(n.id);
                      if (onNavigateNotifications) {
                        onNavigateNotifications();
                        setIsOpen(false);
                      }
                    }}
                    className={`p-3.5 transition-colors cursor-pointer text-xs ${
                      isRead ? 'bg-white hover:bg-slate-50' : 'bg-blue-50/50 hover:bg-blue-50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h5 className="font-bold text-slate-900 line-clamp-1">{n.title}</h5>
                      {!isRead && (
                        <span className="w-2 h-2 bg-blue-600 rounded-full shrink-0 mt-1" />
                      )}
                    </div>
                    <p className="text-[11px] text-slate-600 line-clamp-2 mt-1 leading-normal">
                      {n.message}
                    </p>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          {onNavigateNotifications && (
            <div className="p-3 bg-slate-50 border-t border-slate-100 text-center">
              <button
                onClick={() => {
                  onNavigateNotifications();
                  setIsOpen(false);
                }}
                className="text-xs font-bold text-blue-600 hover:text-blue-700 inline-flex items-center gap-1"
              >
                <span>View All Notifications</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
