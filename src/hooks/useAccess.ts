import { useMemo } from 'react';
import { UserProfile } from '../types';

export const useAccess = (userProfile: UserProfile | null) => {
  return useMemo(() => {
    const isApproved = userProfile?.status === 'approved';
    const isPending = userProfile?.status === 'pending';
    const isRejected = userProfile?.status === 'rejected';
    const isSuspended = userProfile?.status === 'suspended';

    return {
      isApproved,
      isPending,
      isRejected,
      isSuspended,
      canAccessFullApp: isApproved,
      accessLevel: userProfile?.status || 'unknown'
    };
  }, [userProfile]);
};
