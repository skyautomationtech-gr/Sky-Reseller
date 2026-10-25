import React, { useState } from 'react';
import { UserProfile, PayoutMethod } from '../../../types';
import { Smartphone, Building2 } from 'lucide-react';

const BANKS = [
  'Sonali Bank', 'Janata Bank', 'Agrani Bank', 'Rupali Bank', 'BASIC Bank',
  'Bangladesh Development Bank', 'Bangladesh Krishi Bank', 'Rajshahi Krishi Unnayan Bank',
  'Probashi Kallyan Bank', 'Ansar VDP Unnayan Bank', 'Karmasangsthan Bank', 'Grameen Bank',
  'AB Bank', 'Al-Arafah Islami Bank', 'Bank Asia', 'BRAC Bank', 'City Bank',
  'Dhaka Bank', 'Dutch-Bangla Bank', 'Eastern Bank', 'EXIM Bank', 'First Security Islami Bank',
  'Global Islami Bank', 'IFIC Bank', 'Islami Bank Bangladesh', 'Jamuna Bank', 'Meghna Bank',
  'Mercantile Bank', 'Midland Bank', 'Modhumoti Bank', 'Mutual Trust Bank', 'National Bank',
  'NCC Bank', 'NRB Bank', 'NRB Commercial Bank', 'One Bank', 'Padma Bank', 'Premier Bank',
  'Prime Bank', 'Pubali Bank', 'Shahjalal Islami Bank', 'Social Islami Bank',
  'South Bangla Agriculture & Commerce Bank', 'Southeast Bank', 'Standard Bank', 'Trust Bank',
  'Union Bank', 'United Commercial Bank', 'Uttara Bank', 'Citizens Bank', 'Community Bank',
  'ICB Islamic Bank', 'Bengal Commercial Bank', 'Commercial Bank of Ceylon',
  'Standard Chartered', 'HSBC', 'Citibank N.A.', 'Habib Bank', 'State Bank of India', 'Woori Bank', 'Bank Alfalah', 'National Bank of Pakistan'
];

export const PayoutInfoStep = ({ data, update }: any) => {
  const [method, setMethod] = useState<PayoutMethod['type']>(data.payoutMethod || 'bKash');

  const updatePayout = (updates: Partial<PayoutMethod>) => {
    update({ 
      payoutMethod: method, 
      payoutMethods: [{ ...updates, type: method, isDefault: true, id: Date.now().toString(), verified: false, addedAt: new Date() }] 
    });
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3">
        {['bKash', 'Nagad', 'Rocket', 'Upay', 'Bank'].map(m => (
          <button key={m} onClick={() => setMethod(m as PayoutMethod['type'])} className={`p-4 rounded-2xl border ${method === m ? 'bg-cyan-600/20 border-cyan-500' : 'bg-white/5 border-white/10'} text-white`}>
            {m}
          </button>
        ))}
      </div>
      
      {method !== 'Bank' ? (
        <div className="space-y-4">
          <input type="text" placeholder="Account Holder Name" className="w-full p-4 rounded-full bg-white/10 text-white" />
          <div className="flex gap-2">
            <input type="text" placeholder="Account Number" className="flex-1 p-4 rounded-full bg-white/10 text-white" />
            <button className="px-4 bg-white/10 text-white rounded-full">Same as mobile</button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <select className="w-full p-4 rounded-full bg-white/10 text-white">
            <option>Select Bank</option>
            {BANKS.map(b => <option key={b}>{b}</option>)}
          </select>
          <input type="text" placeholder="Account Holder Name" className="w-full p-4 rounded-full bg-white/10 text-white" />
          <input type="text" placeholder="Branch Name" className="w-full p-4 rounded-full bg-white/10 text-white" />
          <input type="text" placeholder="Routing Number (9 digits)" className="w-full p-4 rounded-full bg-white/10 text-white" />
          <input type="text" placeholder="Account Number (8-20 digits)" className="w-full p-4 rounded-full bg-white/10 text-white" />
        </div>
      )}
    </div>
  );
};
