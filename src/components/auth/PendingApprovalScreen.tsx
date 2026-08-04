import React from 'react';
import { Clock, LogOut, ShieldAlert } from 'lucide-react';
import { UserProfile } from '../../types';

interface PendingApprovalScreenProps {
  user: UserProfile;
  onLogout: () => void;
}

export const PendingApprovalScreen: React.FC<PendingApprovalScreenProps> = ({ user, onLogout }) => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-orange-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl border border-amber-100 max-w-lg w-full p-8 text-center relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-2 bg-amber-500"></div>

        <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm">
          <Clock className="w-8 h-8 animate-pulse" />
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-2">Account Under Review</h1>
        <p className="text-gray-600 text-sm mb-6 leading-relaxed">
          Assalamu Alaikum, <span className="font-semibold text-gray-900">{user.fullName}</span>! Your reseller account for <span className="font-semibold text-gray-900">{user.shopName}</span> has been successfully submitted and is currently pending review by Sky Automation Tech administrators.
        </p>

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-left mb-6 space-y-2 text-xs text-amber-900">
          <div className="flex justify-between">
            <span className="font-medium text-amber-800">Mobile:</span>
            <span className="font-mono">{user.mobile}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-medium text-amber-800">Location:</span>
            <span>{user.upazila}, {user.district}, {user.division}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-medium text-amber-800">Status:</span>
            <span className="bg-amber-200 text-amber-900 font-semibold px-2 py-0.5 rounded-full uppercase text-[10px]">Pending Approval</span>
          </div>
        </div>

        <p className="text-xs text-gray-500 mb-8">
          You will receive access to the Reseller Dashboard as soon as an admin approves your application.
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
