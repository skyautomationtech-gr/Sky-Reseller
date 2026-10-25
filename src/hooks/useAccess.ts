import { useMemo } from 'react';
import { UserProfile } from '../types';

export interface AccessControl {
  isApproved: boolean;
  isPending: boolean;
  isRejected: boolean;
  isSuspended: boolean;
  canAccessFullApp: boolean;
  accessLevel: string;
  canOrder: boolean;
  canViewPrices: boolean;
  canAccessWallet: boolean;
  canCreateTickets: boolean;
  canSubmitReviews: boolean;
}

export const useAccess = (userProfile: UserProfile | null | undefined): AccessControl => {
  return useMemo(() => {
    const isAdmin = userProfile?.role === 'admin' || userProfile?.role === 'super_admin';
    const isApproved = isAdmin || userProfile?.status === 'approved';
    const isPending = !isAdmin && userProfile?.status === 'pending';
    const isRejected = !isAdmin && userProfile?.status === 'rejected';
    const isSuspended = !isAdmin && userProfile?.status === 'suspended';

    const canAccessFullApp = isApproved;

    return {
      isApproved,
      isPending,
      isRejected,
      isSuspended,
      canAccessFullApp,
      accessLevel: userProfile?.status || 'unknown',
      canOrder: canAccessFullApp,
      canViewPrices: canAccessFullApp,
      canAccessWallet: canAccessFullApp,
      canCreateTickets: canAccessFullApp,
      canSubmitReviews: canAccessFullApp,
    };
  }, [userProfile?.status, userProfile?.role]);
};
