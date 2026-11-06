// ─────────────────────────────────────────────────────────────────────────────
// SMC Chrome Extension – IndexedDB Wrapper
// ─────────────────────────────────────────────────────────────────────────────

import type { Trade, TradeFilters, ImportedDataset, AppSettings } from '@/types';

const DB_NAME = 'smc-trading-db';
const DB_VERSION = 1;

// ── Object store names ────────────────────────────────────────────────────────
const STORE_TRADES = 'trades';
const STORE_DATASETS = 'datasets';
const STORE_SETTINGS = 'settings';
const STORE_BACKTEST = 'backtest-results';

// ── Promise wrapper for IDBRequest ────────────────────────────────────────────
function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ── TradeFilters type (may not be exported from types yet) ───────────────────
// Declared here defensively; imported from @/types if already defined there.
// The import above covers it when present.

export class SMCDatabase {
  private db: IDBDatabase | null = null;

  // ── Open / upgrade ──────────────────────────────────────────────────────────
  async open(): Promise<void> {
    if (this.db) return; // already open

    return new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
        const database = (event.target as IDBOpenDBRequest).result;

        // ── trades store ──────────────────────────────────────────────────────
        if (!database.objectStoreNames.contains(STORE_TRADES)) {
          const tradesStore = database.createObjectStore(STORE_TRADES, {
            keyPath: 'id',
          });
          tradesStore.createIndex('market', 'market', { unique: false });
          tradesStore.createIndex('status', 'status', { unique: false });
          tradesStore.createIndex('createdAt', 'createdAt', { unique: false });
        }

        // ── datasets store ────────────────────────────────────────────────────
        if (!database.objectStoreNames.contains(STORE_DATASETS)) {
          const datasetsStore = database.createObjectStore(STORE_DATASETS, {
            keyPath: 'id',
          });
          datasetsStore.createIndex('symbol', 'symbol', { unique: false });
          datasetsStore.createIndex('market', 'market', { unique: false });
        }

        // ── settings store ────────────────────────────────────────────────────
        if (!database.objectStoreNames.contains(STORE_SETTINGS)) {
          database.createObjectStore(STORE_SETTINGS, { keyPath: 'key' });
        }

        // ── backtest-results store ────────────────────────────────────────────
        if (!database.objectStoreNames.contains(STORE_BACKTEST)) {
          database.createObjectStore(STORE_BACKTEST, { keyPath: 'id' });
        }
      };

      request.onsuccess = () => {
        this.db = request.result;

        // Handle unexpected version change from another tab
        this.db.onversionchange = () => {
          this.db?.close();
          this.db = null;
        };

        resolve();
      };

      request.onerror = () => reject(request.error);
      request.onblocked = () =>
        reject(new Error('IndexedDB open blocked by another connection'));
    });
  }

  // ── Private helper: get open DB ────────────────────────────────────────────
  private getDB(): IDBDatabase {
    if (!this.db) throw new Error('Database is not open. Call open() first.');
    return this.db;
  }

  // ── Private helper: run a transaction ─────────────────────────────────────
  private tx(
    stores: string | string[],
    mode: IDBTransactionMode = 'readonly',
  ): IDBTransaction {
    return this.getDB().transaction(stores, mode);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TRADES
  // ─────────────────────────────────────────────────────────────────────────

  async putTrade(trade: Trade): Promise<void> {
    const transaction = this.tx(STORE_TRADES, 'readwrite');
    const store = transaction.objectStore(STORE_TRADES);
    await promisify<IDBValidKey>(store.put(trade));
  }

  async saveTrade(trade: Trade): Promise<void> {
    return this.putTrade(trade);
  }

  async updateTrade(id: string, updates: Partial<Trade>): Promise<void> {
    const existing = await this.getTrade(id);
    if (!existing) return;
    const merged = { ...existing, ...updates };
    await this.putTrade(merged);
  }

  async getTrade(id: string): Promise<Trade | null> {
    const transaction = this.tx(STORE_TRADES);
    const store = transaction.objectStore(STORE_TRADES);
    const result = await promisify<Trade | undefined>(store.get(id));
    return result ?? null;
  }

  async getAllTrades(filters?: TradeFilters): Promise<Trade[]> {
    const transaction = this.tx(STORE_TRADES);
    const store = transaction.objectStore(STORE_TRADES);
    const all = await promisify<Trade[]>(store.getAll());

    if (!filters) return all;

    return all.filter((trade) => {
      if (filters.market && trade.market !== filters.market) return false;
      if (
        filters.symbol &&
        trade.symbol.toLowerCase() !== filters.symbol.toLowerCase()
      )
        return false;
      if (filters.status && trade.status !== filters.status) return false;
      if (filters.startDate && trade.createdAt < filters.startDate) return false;
      if (filters.endDate && trade.createdAt > filters.endDate) return false;
      return true;
    });
  }

  async deleteTrade(id: string): Promise<void> {
    const transaction = this.tx(STORE_TRADES, 'readwrite');
    const store = transaction.objectStore(STORE_TRADES);
    await promisify<undefined>(store.delete(id));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // DATASETS
  // ─────────────────────────────────────────────────────────────────────────

  async putDataset(dataset: ImportedDataset): Promise<void> {
    const transaction = this.tx(STORE_DATASETS, 'readwrite');
    const store = transaction.objectStore(STORE_DATASETS);
    await promisify<IDBValidKey>(store.put(dataset));
  }

  async saveDataset(dataset: ImportedDataset, _candles?: any): Promise<void> {
    return this.putDataset(dataset);
  }

  async getDataset(id: string): Promise<ImportedDataset | null> {
    const transaction = this.tx(STORE_DATASETS);
    const store = transaction.objectStore(STORE_DATASETS);
    const result = await promisify<ImportedDataset | undefined>(store.get(id));
    return result ?? null;
  }

  async getAllDatasets(): Promise<ImportedDataset[]> {
    const transaction = this.tx(STORE_DATASETS);
    const store = transaction.objectStore(STORE_DATASETS);
    return promisify<ImportedDataset[]>(store.getAll());
  }

  async deleteDataset(id: string): Promise<void> {
    const transaction = this.tx(STORE_DATASETS, 'readwrite');
    const store = transaction.objectStore(STORE_DATASETS);
    await promisify<undefined>(store.delete(id));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SETTINGS  (single record stored under key = 'app')
  // ─────────────────────────────────────────────────────────────────────────

  async putSettings(settings: AppSettings): Promise<void> {
    const transaction = this.tx(STORE_SETTINGS, 'readwrite');
    const store = transaction.objectStore(STORE_SETTINGS);
    // Wrap with keyPath field 'key' so IDB can store it
    await promisify<IDBValidKey>(store.put({ key: 'app', ...settings }));
  }

  async getSettings(): Promise<AppSettings | null> {
    const transaction = this.tx(STORE_SETTINGS);
    const store = transaction.objectStore(STORE_SETTINGS);
    const result = await promisify<(AppSettings & { key: string }) | undefined>(
      store.get('app'),
    );
    if (!result) return null;
    // Strip the synthetic 'key' field before returning
    const { key: _key, ...settings } = result;
    return settings as AppSettings;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CLEAR ALL DATA
  // ─────────────────────────────────────────────────────────────────────────

  async clear(): Promise<void> {
    const stores = [STORE_TRADES, STORE_DATASETS, STORE_SETTINGS, STORE_BACKTEST];
    const transaction = this.tx(stores, 'readwrite');

    await Promise.all(
      stores.map((name) =>
        promisify<undefined>(transaction.objectStore(name).clear()),
      ),
    );
  }
}

// ── Singleton export ───────────────────────────────────────────────────────────
export const db = new SMCDatabase();
