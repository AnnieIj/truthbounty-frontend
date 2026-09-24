'use client';

import React, { useState } from 'react';
import { useFeatureFlags } from './FeatureFlagProvider';
import { DEFAULT_FLAGS } from '@/config/feature-flags';

interface FeatureFlagPanelProps {
  /** Whether the panel is initially open */
  defaultOpen?: boolean;
  /** Position of the panel */
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
}

/**
 * FeatureFlagPanel
 * 
 * Development-only panel for toggling feature flags at runtime.
 * Only renders in development mode.
 * 
 * @example
 * ```tsx
 * <FeatureFlagPanel defaultOpen={false} position="bottom-right" />
 * ```
 */
export function FeatureFlagPanel({
  defaultOpen = false,
  position = 'bottom-right',
}: FeatureFlagPanelProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [filter, setFilter] = useState('');
  
  const {
    getAllFlags,
    setFlag,
    resetFlag,
    resetAllFlags,
    hasOverrides,
  } = useFeatureFlags();
  
  // Only show in development
  if (process.env.NODE_ENV !== 'development') {
    return null;
  }
  
  const positionClasses = {
    'bottom-right': 'bottom-4 right-4',
    'bottom-left': 'bottom-4 left-4',
    'top-right': 'top-4 right-4',
    'top-left': 'top-4 left-4',
  };
  
  const flags = getAllFlags();
  const filteredFlags = filter
    ? flags.filter(f => 
        f.flag.toLowerCase().includes(filter.toLowerCase()) ||
        f.meta.description.toLowerCase().includes(filter.toLowerCase())
      )
    : flags;
  
  const groupedFlags = filteredFlags.reduce((acc, f) => {
    const category = f.meta.category;
    if (!acc[category]) acc[category] = [];
    acc[category].push(f);
    return acc;
  }, {} as Record<string, typeof filteredFlags>);
  
  return (
    <div className={`fixed ${positionClasses[position]} z-50`}>
      {/* Toggle button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`
          flex items-center gap-2 px-3 py-2 rounded-lg shadow-lg
          ${hasOverrides ? 'bg-amber-500 hover:bg-amber-600' : 'bg-zinc-800 hover:bg-zinc-700'}
          text-white text-sm font-medium transition-colors
        `}
        aria-label="Toggle feature flags panel"
        aria-expanded={isOpen}
      >
        <span className="text-lg">🚩</span>
        <span className="hidden sm:inline">Feature Flags</span>
        {hasOverrides && (
          /* V2-FE-071 — decorative override dot. animate-pulse is stripped by
             the CSS reduced-motion layer, so the white dot stays as a static
             cue; the amber button color carries the meaning. */
          <span
            className="w-2 h-2 bg-white rounded-full animate-pulse"
            aria-hidden="true"
          />
        )}
      </button>
      
      {/* Panel */}
      {isOpen && (
        <div className="absolute bottom-12 right-0 w-80 sm:w-96 bg-zinc-900 rounded-lg shadow-2xl border border-zinc-700 overflow-hidden">
          {/* Header */}
          <div className="p-3 border-b border-zinc-700 bg-zinc-800">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-white font-semibold">Feature Flags</h3>
              <div className="flex gap-2">
                {hasOverrides && (
                  <button
                    onClick={resetAllFlags}
                    className="text-xs px-2 py-1 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded"
                  >
                    Reset All
                  </button>
                )}
                <button
                  onClick={() => setIsOpen(false)}
                  className="text-zinc-400 hover:text-white"
                  aria-label="Close panel"
                >
                  ✕
                </button>
              </div>
            </div>
            <input
              type="text"
              placeholder="Filter flags..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="w-full px-2 py-1 text-sm bg-zinc-700 text-white rounded border border-zinc-600 focus:border-blue-500 focus:outline-none"
            />
          </div>
          
          {/* Flags list */}
          <div className="max-h-80 overflow-y-auto">
            {Object.entries(groupedFlags).map(([category, categoryFlags]) => (
              <div key={category} className="border-b border-zinc-800 last:border-b-0">
                <div className="px-3 py-1.5 bg-zinc-800/50 text-zinc-400 text-xs font-semibold uppercase tracking-wide">
                  {category}
                </div>
                {categoryFlags.map(({ flag, enabled, meta }) => {
                  const isOverridden = enabled !== DEFAULT_FLAGS[flag];
                  
                  return (
                    <div
                      key={flag}
                      className="flex items-center justify-between px-3 py-2 hover:bg-zinc-800/30"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-white text-sm truncate">
                            {flag.replace(/_/g, ' ')}
                          </span>
                          {isOverridden && (
                            <span className="text-xs text-amber-400">*</span>
                          )}
                        </div>
                        <p className="text-zinc-500 text-xs truncate">
                          {meta.description}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 ml-2">
                        {isOverridden && (
                          <button
                            onClick={() => resetFlag(flag)}
                            className="text-xs text-zinc-500 hover:text-zinc-300"
                            aria-label={`Reset ${flag}`}
                          >
                            ↺
                          </button>
                        )}
                        <button
                          onClick={() => setFlag(flag, !enabled)}
                          className={`
                            relative inline-flex h-5 w-9 items-center rounded-full transition-colors
                            ${enabled ? 'bg-green-500' : 'bg-zinc-600'}
                          `}
                          role="switch"
                          aria-checked={enabled}
                          aria-label={`Toggle ${flag}`}
                        >
                          <span
                            className={`
                              inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform
                              ${enabled ? 'translate-x-5' : 'translate-x-0.5'}
                            `}
                          />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          
          {/* Footer */}
          <div className="p-2 border-t border-zinc-700 bg-zinc-800 text-center">
            <p className="text-xs text-zinc-500">
              Changes are persisted in localStorage
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
