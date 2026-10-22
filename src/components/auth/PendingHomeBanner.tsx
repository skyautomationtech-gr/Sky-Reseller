import React, { useState, useEffect } from 'react';
import { UserProfile } from '../../types';

export const PendingHomeBanner: React.FC<{ user: UserProfile }> = ({ user }) => {
  const [elapsed, setElapsed] = useState('');

  useEffect(() => {
    const updateElapsed = () => {
      const createdAt = new Date(user.createdAt).getTime();
      const now = Date.now();
      const diff = now - createdAt;
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      setElapsed(`${hours}h ${mins}m`);
    };
    updateElapsed();
    const timer = setInterval(updateElapsed, 60000);
    return () => clearInterval(timer);
  }, [user.createdAt]);

  return (
    <div className="bg-amber-500/10 border-b border-amber-500/30 p-4 text-center sticky top-0 z-40 backdrop-blur-md">
      <p className="text-amber-200 font-semibold text-sm">Your account is under review.</p>
      <p className="text-amber-400 text-xs">Pending for {elapsed}. Approval usually takes up to 1 hour.</p>
    </div>
  );
};
