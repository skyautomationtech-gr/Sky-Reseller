import React from 'react';
import { XCircle, LogOut, AlertTriangle } from 'lucide-react';
import { UserProfile } from '../../types';

interface RejectedScreenProps {
  user: UserProfile;
  onLogout: () => void;
}

export const RejectedScreen: React.FC<RejectedScreenProps> = ({ user, onLogout }) => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-white to-red-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl border border-rose-100 max-w-lg w-full p-8 text-center relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-2 bg-rose-600"></div>

        <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm">
          <XCircle className="w-8 h-8" />
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-2">Registration Not Approved</h1>
        <p className="text-gray-600 text-sm mb-6">
          We regret to inform you that your reseller application for <span className="font-semibold text-gray-900">{user.shopName}</span> could not be approved at this time.
        </p>

        {user.rejectReason && (
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-left mb-6">
            <span className="text-xs font-bold text-rose-800 uppercase tracking-wider block mb-1">Reason for Rejection:</span>
            <p className="text-sm text-rose-900 font-medium">{user.rejectReason}</p>
          </div>
        )}

        <p className="text-xs text-gray-500 mb-8">
          If you believe this is a mistake or have updated information, please contact Sky Automation Tech support or register again with correct details.
        </p>

        <button
          onClick={onLogout}
          className="w-full bg-gray-900 text-white py-3 px-4 rounded-xl font-medium hover:bg-gray-800 transition-colors flex items-center justify-center gap-2 text-sm shadow-md"
        >
          <LogOut className="w-4 h-4" />
          <span>Sign Out / Return to Login</span>
        </button>
      </div>
    </div>
  );
};
