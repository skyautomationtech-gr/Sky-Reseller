import React from 'react';
import { Check, X, ShieldAlert, ShieldCheck } from 'lucide-react';

interface PasswordStrengthIndicatorProps {
  password: string;
}

export interface PasswordCriteria {
  hasMinLength: boolean;
  hasUpper: boolean;
  hasLower: boolean;
  hasNumber: boolean;
  hasSymbol: boolean;
  score: number; // 0 to 5
  level: 'none' | 'weak' | 'medium' | 'strong' | 'very_strong';
  isAcceptable: boolean; // score >= 3 (at least Medium)
}

export function evaluatePassword(pwd: string): PasswordCriteria {
  const hasMinLength = pwd.length >= 8;
  const hasUpper = /[A-Z]/.test(pwd);
  const hasLower = /[a-z]/.test(pwd);
  const hasNumber = /[0-9]/.test(pwd);
  const hasSymbol = /[^A-Za-z0-9]/.test(pwd);

  let score = 0;
  if (pwd.length >= 6) score++;
  if (hasMinLength) score++;
  if (hasUpper && hasLower) score++;
  if (hasNumber) score++;
  if (hasSymbol) score++;

  let level: PasswordCriteria['level'] = 'none';
  if (!pwd) {
    level = 'none';
  } else if (score <= 2) {
    level = 'weak';
  } else if (score === 3) {
    level = 'medium';
  } else if (score === 4) {
    level = 'strong';
  } else {
    level = 'very_strong';
  }

  // Minimum required: Medium (score >= 3 and at least 8 chars)
  const isAcceptable = score >= 3 && hasMinLength;

  return {
    hasMinLength,
    hasUpper,
    hasLower,
    hasNumber,
    hasSymbol,
    score,
    level,
    isAcceptable,
  };
}

export const PasswordStrengthIndicator: React.FC<PasswordStrengthIndicatorProps> = ({ password }) => {
  const criteria = evaluatePassword(password);

  if (!password) {
    return (
      <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-1.5">
        <ShieldAlert className="w-3.5 h-3.5 text-slate-500" />
        <span>Password must be at least 8 characters with letters, numbers & symbols.</span>
      </div>
    );
  }

  const getMeterStyles = () => {
    switch (criteria.level) {
      case 'weak':
        return { width: '25%', bg: 'bg-rose-500', text: 'Weak', textColor: 'text-rose-400' };
      case 'medium':
        return { width: '50%', bg: 'bg-amber-400', text: 'Medium (Acceptable)', textColor: 'text-amber-300' };
      case 'strong':
        return { width: '75%', bg: 'bg-[#0E9AA7]', text: 'Strong', textColor: 'text-[#0E9AA7]' };
      case 'very_strong':
        return { width: '100%', bg: 'bg-[#3DD055]', text: 'Very Strong', textColor: 'text-[#3DD055]' };
      default:
        return { width: '0%', bg: 'bg-slate-600', text: '', textColor: 'text-slate-400' };
    }
  };

  const meter = getMeterStyles();

  const rules = [
    { label: '8+ characters', pass: criteria.hasMinLength },
    { label: 'Uppercase (A-Z)', pass: criteria.hasUpper },
    { label: 'Lowercase (a-z)', pass: criteria.hasLower },
    { label: 'Number (0-9)', pass: criteria.hasNumber },
    { label: 'Symbol (!@#$%)', pass: criteria.hasSymbol },
  ];

  return (
    <div className="space-y-2 mt-2 p-3 rounded-2xl bg-white/[0.04] border border-white/10 text-xs">
      {/* Strength Bar */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-slate-300 font-medium">Password Strength:</span>
          <span className={`font-bold ${meter.textColor}`}>{meter.text}</span>
        </div>
        <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
          <div
            className={`h-full transition-all duration-300 rounded-full ${meter.bg}`}
            style={{ width: meter.width }}
          />
        </div>
      </div>

      {/* Checklist */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 pt-1">
        {rules.map((r, i) => (
          <div
            key={i}
            className={`flex items-center gap-1.5 text-[10px] font-semibold transition-colors ${
              r.pass ? 'text-[#3DD055]' : 'text-slate-400'
            }`}
          >
            {r.pass ? (
              <Check className="w-3 h-3 text-[#3DD055] shrink-0" />
            ) : (
              <X className="w-3 h-3 text-slate-500 shrink-0" />
            )}
            <span>{r.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
