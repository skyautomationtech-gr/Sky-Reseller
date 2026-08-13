import React, { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';

const defaultLogoAsset = '/Sky Automation Tech Logo.jpeg';

interface SkyLogoProps {
  className?: string;
  imgClassName?: string;
  showText?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  lightMode?: boolean;
  customLogoUrl?: string | null;
}

export const SkyLogo: React.FC<SkyLogoProps> = ({
  className = '',
  imgClassName = '',
  showText = true,
  size = 'md',
  lightMode = false,
  customLogoUrl,
}) => {
  const [logoUrl, setLogoUrl] = useState<string | null>(customLogoUrl || defaultLogoAsset);
  const [companyName, setCompanyName] = useState<string>('SKY AUTOMATION TECH');

  useEffect(() => {
    if (customLogoUrl !== undefined && customLogoUrl !== null) {
      setLogoUrl(customLogoUrl);
      return;
    }

    const fetchLogo = async () => {
      try {
        const snap = await getDoc(doc(db, 'settings', 'general'));
        if (snap.exists()) {
          const data = snap.data();
          if (data.logoUrl) setLogoUrl(data.logoUrl);
          if (data.companyName) setCompanyName(data.companyName);
        } else {
          setLogoUrl(defaultLogoAsset);
        }
      } catch (err) {
        console.error('Error loading logo in SkyLogo component:', err);
        setLogoUrl(defaultLogoAsset);
      }
    };

    fetchLogo();
  }, [customLogoUrl]);

  const dimensions = {
    sm: { box: 'w-7 h-7', text: 'text-xs', sub: 'text-[9px]' },
    md: { box: 'w-10 h-10', text: 'text-sm font-bold', sub: 'text-[10px]' },
    lg: { box: 'w-14 h-14', text: 'text-lg font-extrabold', sub: 'text-xs' },
    xl: { box: 'w-20 h-20', text: 'text-2xl font-black', sub: 'text-sm' },
  }[size];

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {logoUrl ? (
        <img
          src={logoUrl}
          alt={companyName}
          onError={() => setLogoUrl('/logo.jpg')}
          className={`${dimensions.box} object-contain rounded-xl border border-slate-200/20 bg-white/5 p-1 shrink-0 ${imgClassName}`}
        />
      ) : (
        <div className={`${dimensions.box} rounded-xl bg-gradient-to-br from-cyan-500 via-blue-600 to-purple-700 flex items-center justify-center p-1.5 shadow-md shadow-blue-500/20 shrink-0 text-white`}>
          {/* Custom SVG Tech Circuit Icon */}
          <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full text-white">
            <circle cx="50" cy="50" r="44" stroke="currentColor" strokeWidth="3" strokeDasharray="6 4" opacity="0.6" />
            <path d="M50 18 C30 18 18 30 18 50 C18 70 30 82 50 82 C70 82 82 70 82 50 C82 30 70 18 50 18 Z" stroke="currentColor" strokeWidth="4" />
            <path d="M32 36 L50 24 L68 36 L68 64 L50 76 L32 64 Z" stroke="currentColor" strokeWidth="3.5" strokeLinejoin="round" />
            <path d="M50 38 L50 62 M38 50 L62 50" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            <circle cx="50" cy="50" r="5" fill="currentColor" />
          </svg>
        </div>
      )}

      {showText && (
        <div className="flex flex-col overflow-hidden">
          <span className={`tracking-tight font-extrabold truncate ${dimensions.text} ${lightMode ? 'text-slate-900' : 'text-white'}`}>
            {companyName}
          </span>
          <span className={`tracking-wider uppercase font-semibold text-cyan-400 ${dimensions.sub} opacity-90`}>
            AUTOMATE • INNOVATE • ELEVATE
          </span>
        </div>
      )}
    </div>
  );
};
