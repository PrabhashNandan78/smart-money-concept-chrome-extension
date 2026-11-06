// ─────────────────────────────────────────────────────────────────────────────
// SMC Storage – Settings Manager
// ─────────────────────────────────────────────────────────────────────────────

import type { AppSettings } from '../types';
import { DEFAULT_SETTINGS } from '../store/appStore';

export async function loadSettings(): Promise<AppSettings> {
  return new Promise((resolve) => {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        chrome.storage.local.get(['settings'], (result) => {
          resolve((result.settings as AppSettings) || DEFAULT_SETTINGS);
        });
      } else {
        const stored = localStorage.getItem('smc_settings');
        resolve(stored ? JSON.parse(stored) : DEFAULT_SETTINGS);
      }
    } catch {
      resolve(DEFAULT_SETTINGS);
    }
  });
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  // Hard enforce minRR at 3.0
  const sanitized = {
    ...settings,
    risk: {
      ...settings.risk,
      minRR: Math.max(3.0, settings.risk.minRR),
    },
  };

  return new Promise((resolve) => {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        chrome.storage.local.set({ settings: sanitized }, () => resolve());
      } else {
        localStorage.setItem('smc_settings', JSON.stringify(sanitized));
        resolve();
      }
    } catch {
      resolve();
    }
  });
}

