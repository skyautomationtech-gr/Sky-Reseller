import React, { useState } from 'react';
import { sendEmailOtpCall, verifyEmailOtpCall } from '../../../lib/emailOtpService';

export const ContactInfoStep = ({ data, update }: any) => {
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'input' | 'verify'>('input');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const sendOtp = async () => {
    try {
      setLoading(true);
      setError('');
      await sendEmailOtpCall(data.email);
      setStep('verify');
    } catch (err: any) {
      setError(err.message || 'Failed to send OTP');
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await verifyEmailOtpCall(data.email, otp);
      if (res.verified) {
        update({ emailVerified: true });
      }
    } catch (err: any) {
      setError(err.message || 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {step === 'input' ? (
        <>
          <input type="email" placeholder="Email Address" value={data.email} onChange={e => update({ email: e.target.value })} className="w-full p-4 rounded-full bg-white/10 text-white" />
          <button onClick={sendOtp} className="w-full py-3 bg-cyan-600 text-white rounded-full">Send OTP</button>
        </>
      ) : (
        <>
          <input type="text" placeholder="Enter OTP" value={otp} onChange={e => setOtp(e.target.value)} className="w-full p-4 rounded-full bg-white/10 text-white" />
          <button onClick={verifyOtp} className="w-full py-3 bg-cyan-600 text-white rounded-full">Verify OTP</button>
        </>
      )}
      <input type="tel" placeholder="Mobile Number" value={data.mobile} onChange={e => update({ mobile: e.target.value })} className="w-full p-4 rounded-full bg-white/10 text-white" />
      <input type="tel" placeholder="WhatsApp Number" value={data.whatsapp} onChange={e => update({ whatsapp: e.target.value })} className="w-full p-4 rounded-full bg-white/10 text-white" />
    </div>
  );
};
