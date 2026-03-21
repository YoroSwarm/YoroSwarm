'use client';

import { useLeadPreferencesStore } from '@/stores';
import { useEffect } from 'react';

export function GlobalBackground() {
  const { glassEffect, backgroundImage } = useLeadPreferencesStore();

  useEffect(() => {
    const root = document.documentElement;

    if (glassEffect) {
      root.setAttribute('data-glass-effect', 'true');
    } else {
      root.removeAttribute('data-glass-effect');
    }

    if (glassEffect && backgroundImage) {
      root.style.setProperty('--background-image', `url(${backgroundImage})`);
      root.setAttribute('data-has-background', 'true');
    } else {
      root.style.removeProperty('--background-image');
      root.removeAttribute('data-has-background');
    }

    return () => {
      root.removeAttribute('data-glass-effect');
      root.removeAttribute('data-has-background');
      root.style.removeProperty('--background-image');
    };
  }, [glassEffect, backgroundImage]);

  return null;
}

/**
 * 玻璃态效果组件包装器
 * 当启用玻璃态时，给子元素添加半透明背景和模糊效果
 */
export function GlassEffect({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const { glassEffect } = useLeadPreferencesStore();

  if (!glassEffect) {
    return <>{children}</>;
  }

  return (
    <div className={`glass-effect ${className}`}>
      {children}
    </div>
  );
}
