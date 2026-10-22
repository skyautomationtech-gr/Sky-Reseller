import React from 'react';
import { useAccess } from '../../hooks/useAccess';
import { UserProfile } from '../../types';
import { Lock } from 'lucide-react';

interface StatusGuardProps {
  userProfile: UserProfile | null;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export const StatusGuard: React.FC<StatusGuardProps> = ({ userProfile, children, fallback }) => {
  const { canAccessFullApp } = useAccess(userProfile);

  if (canAccessFullApp) {
    return <>{children}</>;
  }

  return fallback || (
    <div className="flex flex-col items-center justify-center p-8 text-center text-slate-500">
      <Lock className="w-12 h-12 mb-4 opacity-50" />
      <p>This feature unlocks after your account is approved.</p>
    </div>
  );
};
