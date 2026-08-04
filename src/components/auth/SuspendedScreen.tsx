import React from 'react';
import { Ban, LogOut } from 'lucide-react';
import { UserProfile } from '../../types';

interface SuspendedScreenProps {
  user: UserProfile;
  onLogout: () => void;
}

export const SuspendedScreen: React.FC<SuspendedScreenProps> = ({ user, onLogout }) => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-100 via-white to-slate-200 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl border border-gray-200 max-w-lg w-full p-8 text-center relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-2 bg-gray-800"></div>

        <div className="w-16 h-16 bg-gray-100 text-gray-800 rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm">
          <Ban className="w-8 h-8" />
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-2">Account Suspended</h1>
        <p className="text-gray-600 text-sm mb-6">
          Your account for <span className="font-semibold text-gray-900">{user.shopName}</span> has been temporarily suspended by Sky Automation Tech administration.
        </p>

        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-left mb-6 text-xs text-gray-700 space-y-1">
          <div className="flex justify-between">
            <span className="font-medium">Account Email:</span>
            <span className="font-mono">{user.email}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-medium">Status:</span>
            <span className="bg-gray-200 text-gray-800 font-semibold px-2 py-0.5 rounded-full uppercase text-[10px]">Suspended</span>
          </div>
        </div>

        <p className="text-xs text-gray-500 mb-8">
          Please contact our support team at Sky Automation Tech for assistance regarding your account suspension.
        </p>

        <button
          onClick={onLogout}
          className="w-full bg-gray-900 text-white py-3 px-4 rounded-xl font-medium hover:bg-gray-800 transition-colors flex items-center justify-center gap-2 text-sm shadow-md"
        >
          <LogOut className="w-4 h-4" />
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  );
};
