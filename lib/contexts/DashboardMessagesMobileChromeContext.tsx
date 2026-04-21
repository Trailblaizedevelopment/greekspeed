'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export interface DashboardMessagesMobileChromeContextValue {
  /** True when mobile messages thread is open — dashboard chrome hides the global header below `md`. */
  mobileMessageThreadFullscreen: boolean;
  setMobileMessageThreadFullscreen: (value: boolean) => void;
}

const DashboardMessagesMobileChromeContext = createContext<
  DashboardMessagesMobileChromeContextValue | undefined
>(undefined);

export function DashboardMessagesMobileChromeProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [mobileMessageThreadFullscreen, setMobileMessageThreadFullscreen] =
    useState(false);

  const setMobileMessageThreadFullscreenStable = useCallback(
    (value: boolean) => {
      setMobileMessageThreadFullscreen(value);
    },
    []
  );

  const value = useMemo(
    () => ({
      mobileMessageThreadFullscreen,
      setMobileMessageThreadFullscreen: setMobileMessageThreadFullscreenStable,
    }),
    [mobileMessageThreadFullscreen, setMobileMessageThreadFullscreenStable]
  );

  return (
    <DashboardMessagesMobileChromeContext.Provider value={value}>
      {children}
    </DashboardMessagesMobileChromeContext.Provider>
  );
}

/** Safe outside dashboard (e.g. ChatWindow in drawers): no-op setter, fullscreen false. */
export function useDashboardMessagesMobileChrome(): DashboardMessagesMobileChromeContextValue {
  const ctx = useContext(DashboardMessagesMobileChromeContext);
  if (ctx) return ctx;
  return {
    mobileMessageThreadFullscreen: false,
    setMobileMessageThreadFullscreen: () => {},
  };
}
