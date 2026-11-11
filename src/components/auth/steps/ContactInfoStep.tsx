import React from 'react';
import { OtpVerificationInput } from '../register/OtpVerificationInput';

export const ContactInfoStep = ({ data, update }: any) => {
  return (
    <div className="space-y-4">
      <OtpVerificationInput
        email={data.email || ''}
        isVerified={Boolean(data.emailVerified)}
        onVerifiedChange={(verified) => update({ emailVerified: verified })}
        onEmailChange={(email) => update({ email, emailVerified: false })}
      />
      
      <div className="space-y-1.5">
        <label className="text-xs font-bold text-slate-200">Mobile Number (মোবাইল নম্বর)</label>
        <input 
          type="tel" 
          placeholder="e.g. 01712345678" 
          value={data.mobile || ''} 
          onChange={(e) => update({ mobile: e.target.value })} 
          className="w-full min-h-[48px] px-3.5 py-2.5 rounded-xl bg-white/[0.08] backdrop-blur-[24px] border border-white/20 text-white placeholder-slate-400 text-sm font-semibold outline-none focus:border-[#3DD055] focus:ring-2 focus:ring-[#0E9AA7]/50" 
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-bold text-slate-200">WhatsApp Number (হোয়াটসঅ্যাপ নম্বর)</label>
        <input 
          type="tel" 
          placeholder="e.g. 01712345678" 
          value={data.whatsapp || ''} 
          onChange={(e) => update({ whatsapp: e.target.value })} 
          className="w-full min-h-[48px] px-3.5 py-2.5 rounded-xl bg-white/[0.08] backdrop-blur-[24px] border border-white/20 text-white placeholder-slate-400 text-sm font-semibold outline-none focus:border-[#3DD055] focus:ring-2 focus:ring-[#0E9AA7]/50" 
        />
      </div>
    </div>
  );
};
