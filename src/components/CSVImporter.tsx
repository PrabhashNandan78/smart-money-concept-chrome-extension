// ─────────────────────────────────────────────────────────────────────────────
// SMC Component – CSV Importer
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { Upload, FileText, CheckCircle2, AlertTriangle, XCircle, Trash2 } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { parseCSVFile, CSVImportOptions, CSVImportResult } from '../data/csv-importer';
import type { Exchange, Market, Timeframe, ImportedDataset } from '../types';
import { db } from '../db';

export function CSVImporter() {
  const { datasets, addDataset, removeDataset, settings } = useAppStore();

  const [file, setFile] = useState<File | null>(null);
  const [symbol, setSymbol] = useState('RELIANCE');
  const [market, setMarket] = useState<Market>('INDIA');
  const [exchange, setExchange] = useState<Exchange>('NSE');
  const [timeframe, setTimeframe] = useState<Timeframe>('5m');
  const [timezone, setTimezone] = useState('Asia/Kolkata');

  const [colTimestamp, setColTimestamp] = useState('timestamp');
  const [colOpen, setColOpen] = useState('open');
  const [colHigh, setColHigh] = useState('high');
  const [colLow, setColLow] = useState('low');
  const [colClose, setColClose] = useState('close');
  const [colVolume, setColVolume] = useState('volume');

  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<CSVImportResult | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setResult(null);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
      setResult(null);
    }
  };

  const handleImport = async () => {
    if (!file) return;

    setImporting(true);
    setResult(null);

    const options: CSVImportOptions = {
      symbol: symbol.toUpperCase().trim(),
      market,
      exchange,
      timeframe,
      timezone,
      columnMapping: {
        timestamp: colTimestamp,
        open: colOpen,
        high: colHigh,
        low: colLow,
        close: colClose,
        volume: colVolume,
      },
    };

    try {
      const res = await parseCSVFile(file, options);
      setResult(res);

      if (res.success && res.candles.length > 0) {
        const newDataset: ImportedDataset = {
          id: `dataset_${Date.now()}_${symbol}_${timeframe}`,
          symbol: symbol.toUpperCase().trim(),
          market,
          exchange,
          timeframe,
          candles: res.candles,
          importedAt: Date.now(),
          dateRange: res.dateRange || { start: 0, end: 0 },
          totalCandles: res.validRows,
          missingCandles: res.missingCount,
          duplicateCandles: res.duplicates,
          dataQuality: res.dataQuality,
        };

        // Save in indexedDB & store
        await db.saveDataset(newDataset, res.candles);
        addDataset(newDataset);
      }
    } catch (err: unknown) {
      setResult({
        success: false,
        candles: [],
        totalRows: 0,
        validRows: 0,
        duplicates: 0,
        invalidRows: 0,
        missingCount: 0,
        dateRange: null,
        errors: [err instanceof Error ? err.message : 'Unknown error during import'],
        warnings: [],
        dataQuality: 'POOR',
      });
    } finally {
      setImporting(false);
    }
  };

  const handleDelete = async (id: string) => {
    await db.deleteDataset(id);
    removeDataset(id);
  };

  return (
    <div className="space-y-4 text-xs">
      {/* File Dropzone */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        className="border-2 border-dashed border-gray-700 hover:border-accent-green/50 rounded-lg p-4 text-center cursor-pointer transition-colors bg-gray-900/40"
      >
        <Upload className="w-8 h-8 mx-auto mb-2 text-gray-500" />
        <p className="font-medium text-gray-300">
          {file ? file.name : 'Drag & drop historical CSV file here, or click to browse'}
        </p>
        <p className="text-[11px] text-gray-500 mt-1">
          Supports 1m, 5m, 1h, and Daily historical candles
        </p>
        <input
          type="file"
          accept=".csv,.txt"
          onChange={handleFileChange}
          className="hidden"
          id="csv-file-input"
        />
        <label
          htmlFor="csv-file-input"
          className="mt-3 inline-block px-3 py-1 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded cursor-pointer border border-gray-700"
        >
          Select File
        </label>
      </div>

      {/* Import Configuration */}
      <div className="grid grid-cols-2 gap-3 bg-gray-800/40 p-3 rounded-lg border border-gray-700">
        <div>
          <label className="text-gray-400 font-semibold block mb-1">Symbol</label>
          <input
            type="text"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-gray-200 font-mono"
            placeholder="e.g. RELIANCE or AAPL"
          />
        </div>

        <div>
          <label className="text-gray-400 font-semibold block mb-1">Market</label>
          <select
            value={market}
            onChange={(e) => {
              const m = e.target.value as Market;
              setMarket(m);
              setExchange(m === 'INDIA' ? 'NSE' : 'NASDAQ');
              setTimezone(m === 'INDIA' ? 'Asia/Kolkata' : 'America/New_York');
            }}
            className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-gray-200 font-mono"
          >
            <option value="INDIA">India (NSE/BSE)</option>
            <option value="US">United States (NYSE/NASDAQ)</option>
          </select>
        </div>

        <div>
          <label className="text-gray-400 font-semibold block mb-1">Exchange</label>
          <select
            value={exchange}
            onChange={(e) => setExchange(e.target.value as Exchange)}
            className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-gray-200 font-mono"
          >
            {market === 'INDIA' ? (
              <>
                <option value="NSE">NSE</option>
                <option value="BSE">BSE</option>
              </>
            ) : (
              <>
                <option value="NASDAQ">NASDAQ</option>
                <option value="NYSE">NYSE</option>
              </>
            )}
          </select>
        </div>

        <div>
          <label className="text-gray-400 font-semibold block mb-1">Timeframe</label>
          <select
            value={timeframe}
            onChange={(e) => setTimeframe(e.target.value as Timeframe)}
            className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-gray-200 font-mono"
          >
            <option value="1m">1 Minute</option>
            <option value="5m">5 Minutes</option>
            <option value="1h">1 Hour</option>
            <option value="1d">Daily</option>
          </select>
        </div>
      </div>

      {/* Column Mapping */}
      <div className="bg-gray-800/40 p-3 rounded-lg border border-gray-700">
        <p className="text-gray-300 font-medium mb-2">CSV Column Mapping</p>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <span className="text-[10px] text-gray-500">Timestamp</span>
            <input
              type="text"
              value={colTimestamp}
              onChange={(e) => setColTimestamp(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded px-1.5 py-0.5 text-gray-300 font-mono"
            />
          </div>
          <div>
            <span className="text-[10px] text-gray-500">Open</span>
            <input
              type="text"
              value={colOpen}
              onChange={(e) => setColOpen(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded px-1.5 py-0.5 text-gray-300 font-mono"
            />
          </div>
          <div>
            <span className="text-[10px] text-gray-500">High</span>
            <input
              type="text"
              value={colHigh}
              onChange={(e) => setColHigh(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded px-1.5 py-0.5 text-gray-300 font-mono"
            />
          </div>
          <div>
            <span className="text-[10px] text-gray-500">Low</span>
            <input
              type="text"
              value={colLow}
              onChange={(e) => setColLow(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded px-1.5 py-0.5 text-gray-300 font-mono"
            />
          </div>
          <div>
            <span className="text-[10px] text-gray-500">Close</span>
            <input
              type="text"
              value={colClose}
              onChange={(e) => setColClose(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded px-1.5 py-0.5 text-gray-300 font-mono"
            />
          </div>
          <div>
            <span className="text-[10px] text-gray-500">Volume</span>
            <input
              type="text"
              value={colVolume}
              onChange={(e) => setColVolume(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded px-1.5 py-0.5 text-gray-300 font-mono"
            />
          </div>
        </div>
      </div>

      {/* Import Button */}
      <button
        onClick={handleImport}
        disabled={!file || importing}
        className="w-full bg-accent-green hover:bg-accent-green/80 disabled:opacity-50 text-gray-900 font-bold py-2 rounded transition-colors"
      >
        {importing ? 'Validating & Importing...' : 'Validate and Import CSV Data'}
      </button>

      {/* Result Card */}
      {result && (
        <div
          className={`p-3 rounded-lg border ${
            result.success
              ? 'bg-green-950/30 border-green-700/50 text-green-300'
              : 'bg-red-950/30 border-red-700/50 text-red-300'
          }`}
        >
          <div className="flex items-center gap-2 font-bold mb-2">
            {result.success ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
            <span>{result.success ? 'Import Succeeded' : 'Import Failed'}</span>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] font-mono">
            <div>Valid Candles: {result.validRows}</div>
            <div>Missing Estimate: {result.missingCount}</div>
            <div>Duplicate Rows: {result.duplicates}</div>
            <div>Quality Score: {result.dataQuality}</div>
          </div>
          {result.errors.length > 0 && (
            <div className="mt-2 text-[10px] text-red-400">
              {result.errors.slice(0, 3).map((e, idx) => (
                <div key={idx}>• {e}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Existing Datasets */}
      <div className="mt-4 pt-4 border-t border-gray-800">
        <p className="text-gray-400 font-bold uppercase tracking-wider text-[10px] mb-2">
          Imported Datasets ({datasets.length})
        </p>
        {datasets.length === 0 ? (
          <p className="text-gray-600 text-center py-4">No historical datasets imported yet.</p>
        ) : (
          <div className="space-y-2">
            {datasets.map((ds) => (
              <div
                key={ds.id}
                className="bg-gray-800/60 p-2.5 rounded border border-gray-700 flex items-center justify-between"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-gray-200">{ds.symbol}</span>
                    <span className="bg-gray-700 px-1.5 py-0.5 rounded text-[10px] text-gray-300 font-mono">
                      {ds.timeframe}
                    </span>
                    <span className="text-gray-500 text-[10px]">{ds.market}</span>
                  </div>
                  <p className="text-gray-500 text-[10px] mt-0.5 font-mono">
                    {ds.totalCandles} candles • Quality: {ds.dataQuality}
                  </p>
                </div>
                <button
                  onClick={() => handleDelete(ds.id)}
                  className="text-gray-500 hover:text-red-400 p-1"
                  title="Delete Dataset"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

