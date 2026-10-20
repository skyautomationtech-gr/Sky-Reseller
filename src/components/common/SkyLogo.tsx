import React, { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';

import defaultLogo from '../../assets/images/logo.png';

export const DEFAULT_LOGO_ASSET = defaultLogo || '/resellbd-logo.png';

export const isObsoleteLogo = (url?: string | null): boolean => {
  if (!url) return true;
  if (typeof url === 'string') {
    // Check for old base64 sky automation tech logo
    if (url.startsWith('data:image/jpeg;base64,/9j/4AAQSkZJRg')) return true;
    if (url.includes('sky_logo') || url.includes('logo.jpeg') || url.includes('skyautomationtech')) return true;
  }
  return false;
};

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
  const cleanCustom = !isObsoleteLogo(customLogoUrl) ? customLogoUrl : null;
  const [logoUrl, setLogoUrl] = useState<string>(cleanCustom || DEFAULT_LOGO_ASSET);
  const [companyName, setCompanyName] = useState<string>('ReSellBD');
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    const clean = !isObsoleteLogo(customLogoUrl) ? customLogoUrl : null;
    setLogoUrl(clean || DEFAULT_LOGO_ASSET);
    setImgError(false);

    const fetchLogo = async () => {
      try {
        const snap = await getDoc(doc(db, 'settings', 'general'));
        if (snap.exists()) {
          const data = snap.data();
          if (data.companyName && data.companyName !== 'Sky Automation Tech') {
            setCompanyName(data.companyName);
          }
          if (data.logoUrl && !isObsoleteLogo(data.logoUrl) && !cleanCustom) {
            setLogoUrl(data.logoUrl);
          }
        }
      } catch (err) {
        console.error('Error loading company name in SkyLogo component:', err);
      }
    };

    fetchLogo();
  }, [customLogoUrl, cleanCustom]);

  const dimensions = {
    sm: { box: 'w-8 h-8', text: 'text-xs', sub: 'text-[9px]' },
    md: { box: 'w-10 h-10', text: 'text-sm font-bold', sub: 'text-[10px]' },
    lg: { box: 'w-14 h-14', text: 'text-lg font-extrabold', sub: 'text-xs' },
    xl: { box: 'w-20 h-20', text: 'text-2xl font-black', sub: 'text-sm' },
  }[size];

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {!imgError && logoUrl ? (
        <img
          src={logoUrl}
          alt={companyName}
          onError={() => {
            if (logoUrl !== DEFAULT_LOGO_ASSET) {
              setLogoUrl(DEFAULT_LOGO_ASSET);
            } else if (logoUrl !== '/resellbd-logo.png') {
              setLogoUrl('/resellbd-logo.png');
            } else {
              setImgError(true);
            }
          }}
          className={`${dimensions.box} object-contain shrink-0 ${
            lightMode
              ? 'bg-transparent border-0 shadow-none p-0'
              : 'rounded-2xl border border-white/20 bg-white/10 backdrop-blur-xl p-1.5 shadow-lg shadow-indigo-900/20'
          } ${imgClassName}`}
        />
      ) : (
        <div className={`${dimensions.box} flex items-center justify-center shrink-0 overflow-hidden ${
          lightMode
            ? 'bg-transparent border-0 shadow-none p-0'
            : 'rounded-2xl border border-white/20 bg-white/10 backdrop-blur-xl p-1.5 shadow-lg shadow-indigo-900/20'
        }`}>
          <img
            src="/resellbd-logo.png"
            alt={companyName}
            className="w-full h-full object-contain"
          />
        </div>
      )}

      {showText && (
        <div className="flex flex-col overflow-hidden">
          <span className={`tracking-tight font-extrabold truncate ${dimensions.text} ${lightMode ? 'text-slate-900' : 'text-white'}`}>
            {companyName}
          </span>
          <span className={`tracking-wider uppercase font-semibold text-cyan-400 ${dimensions.sub} opacity-90`}>
            WHOLESALE & RESELLING
          </span>
        </div>
      )}
    </div>
  );
};
