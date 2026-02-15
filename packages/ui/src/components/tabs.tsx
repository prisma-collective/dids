'use client';

import {
  createContext,
  useContext,
  useState,
  useRef,
  useCallback,
  useEffect,
  type ReactNode,
  type KeyboardEvent,
} from 'react';
import { cn } from '../lib/cn';

interface TabsContextValue {
  activeTab: string;
  setActiveTab: (id: string) => void;
  tabIds: string[];
  registerTab: (id: string) => void;
  unregisterTab: (id: string) => void;
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabsContext() {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error('Tabs components must be used within <Tabs>');
  return ctx;
}

/* ─── Root ─── */

export interface TabsProps {
  defaultValue: string;
  value?: string;
  onValueChange?: (value: string) => void;
  children: ReactNode;
  className?: string;
}

export function Tabs({ defaultValue, value, onValueChange, children, className }: TabsProps) {
  const [internalValue, setInternalValue] = useState(defaultValue);
  const [tabIds, setTabIds] = useState<string[]>([]);

  const activeTab = value ?? internalValue;

  const setActiveTab = useCallback(
    (id: string) => {
      if (!value) setInternalValue(id);
      onValueChange?.(id);
    },
    [value, onValueChange],
  );

  const registerTab = useCallback((id: string) => {
    setTabIds(prev => prev.includes(id) ? prev : [...prev, id]);
  }, []);

  const unregisterTab = useCallback((id: string) => {
    setTabIds(prev => prev.filter(t => t !== id));
  }, []);

  return (
    <TabsContext value={{
      activeTab,
      setActiveTab,
      tabIds,
      registerTab,
      unregisterTab,
    }}>
      <div className={className}>{children}</div>
    </TabsContext>
  );
}

/* ─── TabList ─── */

export interface TabListProps {
  children: ReactNode;
  className?: string;
}

export function TabList({ children, className }: TabListProps) {
  const { tabIds, setActiveTab, activeTab } = useTabsContext();
  const listRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const currentIndex = tabIds.indexOf(activeTab);
      let nextIndex: number | null = null;

      if (e.key === 'ArrowRight') {
        nextIndex = (currentIndex + 1) % tabIds.length;
      } else if (e.key === 'ArrowLeft') {
        nextIndex = (currentIndex - 1 + tabIds.length) % tabIds.length;
      } else if (e.key === 'Home') {
        nextIndex = 0;
      } else if (e.key === 'End') {
        nextIndex = tabIds.length - 1;
      }

      if (nextIndex !== null) {
        const nextTab = tabIds[nextIndex];
        if (!nextTab) return;
        e.preventDefault();
        setActiveTab(nextTab);
        // Focus the newly activated tab button
        const buttons = listRef.current?.querySelectorAll('[role="tab"]');
        (buttons?.[nextIndex] as HTMLElement)?.focus();
      }
    },
    [tabIds, activeTab, setActiveTab],
  );

  return (
    <div
      ref={listRef}
      role="tablist"
      onKeyDown={handleKeyDown}
      className={cn(
        'flex border-b border-border gap-1',
        className,
      )}
    >
      {children}
    </div>
  );
}

/* ─── Tab (trigger button) ─── */

export interface TabProps {
  value: string;
  children: ReactNode;
  className?: string;
}

export function Tab({ value, children, className }: TabProps) {
  const { activeTab, setActiveTab, registerTab, unregisterTab } = useTabsContext();
  const isActive = activeTab === value;

  // Register on mount, unregister on unmount
  useEffect(() => {
    registerTab(value);
    return () => unregisterTab(value);
  }, [value, registerTab, unregisterTab]);

  return (
    <button
      role="tab"
      id={`tab-${value}`}
      aria-selected={isActive}
      aria-controls={`tabpanel-${value}`}
      tabIndex={isActive ? 0 : -1}
      onClick={() => setActiveTab(value)}
      className={cn(
        'px-4 py-3 text-sm font-medium transition-colors duration-200 -mb-px border-b-2',
        'focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background outline-none rounded-t-md',
        isActive
          ? 'text-primary border-primary'
          : 'text-text-secondary border-transparent hover:text-text-primary hover:bg-surface',
        className,
      )}
    >
      {children}
    </button>
  );
}

/* ─── TabPanel ─── */

export interface TabPanelProps {
  value: string;
  children: ReactNode;
  className?: string;
}

export function TabPanel({ value, children, className }: TabPanelProps) {
  const { activeTab } = useTabsContext();
  const isActive = activeTab === value;

  if (!isActive) return null;

  return (
    <div
      role="tabpanel"
      id={`tabpanel-${value}`}
      aria-labelledby={`tab-${value}`}
      tabIndex={0}
      className={cn('pt-4 animate-fade-in', className)}
    >
      {children}
    </div>
  );
}
