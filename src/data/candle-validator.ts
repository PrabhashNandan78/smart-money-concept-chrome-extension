// ─────────────────────────────────────────────────────────────────────────────
// SMC Data – Candle Validation Engine
// ─────────────────────────────────────────────────────────────────────────────

import type { Candle } from '../types';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate a single OHLCV candle for strict mathematical and structural sanity.
 */
export function validateCandle(candle: Partial<Candle>): ValidationResult {
  const errors: string[] = [];

  const { timestamp, open, high, low, close, volume } = candle;

  if (timestamp === undefined || isNaN(Number(timestamp)) || Number(timestamp) <= 0) {
    errors.push('Invalid timestamp');
  }

  if (open === undefined || isNaN(Number(open)) || Number(open) <= 0) {
    errors.push('Invalid Open price (must be positive number)');
  }

  if (high === undefined || isNaN(Number(high)) || Number(high) <= 0) {
    errors.push('Invalid High price (must be positive number)');
  }

  if (low === undefined || isNaN(Number(low)) || Number(low) <= 0) {
    errors.push('Invalid Low price (must be positive number)');
  }

  if (close === undefined || isNaN(Number(close)) || Number(close) <= 0) {
    errors.push('Invalid Close price (must be positive number)');
  }

  if (volume === undefined || isNaN(Number(volume)) || Number(volume) < 0) {
    errors.push('Invalid Volume (cannot be negative or NaN)');
  }

  // Structural sanity checks
  if (high !== undefined && low !== undefined && high < low) {
    errors.push(`High (${high}) cannot be strictly less than Low (${low})`);
  }

  if (high !== undefined && open !== undefined && high < open) {
    errors.push(`High (${high}) cannot be less than Open (${open})`);
  }

  if (high !== undefined && close !== undefined && high < close) {
    errors.push(`High (${high}) cannot be less than Close (${close})`);
  }

  if (low !== undefined && open !== undefined && low > open) {
    errors.push(`Low (${low}) cannot be greater than Open (${open})`);
  }

  if (low !== undefined && close !== undefined && low > close) {
    errors.push(`Low (${low}) cannot be greater than Close (${close})`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

