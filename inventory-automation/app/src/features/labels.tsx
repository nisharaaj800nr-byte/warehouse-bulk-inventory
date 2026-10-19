import { translate } from '../lib/i18n';
/* Label printing: CODE128 barcodes for shelf/bin labels. */
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import JsBarcode from 'jsbarcode';
import { Printer } from 'lucide-react';
import { api } from '../lib/api';
import { errorMessage } from '../lib/query';
import { Button, Card, EmptyState, ErrorPanel, Input, PageHeader, Select } from '../ui/base';

interface LabelItem {
  barcode: string;
  model: string;
  brand: string;
  location: string;
  bin: string;
}

type LabelSize = '50x25' | '38x25' | '60x30';

interface LabelSettings {
  size: LabelSize;
  columns: number;
  barcodeHeight: number;
  showBarcodeText: boolean;
  showIdentity: boolean;
  showLocation: boolean;
}

const SETTINGS_KEY = 'br.labels.settings.v1';

const SIZE_PRESETS: Record<LabelSize, { label: string; w: number; h: number }> = {
  '50x25': { label: '50 × 25 mm', w: 50, h: 25 },
  '38x25': { label: '38 × 25 mm', w: 38, h: 25 },
  '60x30': { label: '60 × 30 mm', w: 60, h: 30 },
};

const DEFAULT_SETTINGS: LabelSettings = {
  size: '50x25',
  columns: 3,
  barcodeHeight: 42,
  showBarcodeText: true,
  showIdentity: true,
  showLocation: true,
};

function loadSettings(): LabelSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<LabelSettings>;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      size: parsed.size && parsed.size in SIZE_PRESETS ? parsed.size : DEFAULT_SETTINGS.size,
      columns: parsed.columns && [2, 3, 4].includes(parsed.columns) ? parsed.columns : DEFAULT_SETTINGS.columns,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function Barcode({ value, height }: { value: string; height: number }) {
  const ref = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    try {
      JsBarcode(ref.current, value, {
        format: 'CODE128',
        height,
        width: 1.6,
        fontSize: 12,
        margin: 4,
        displayValue: false,
      });
    } catch {
      /* invalid barcode characters are skipped, the text still prints */
    }
  }, [value, height]);

  return <svg ref={ref} style={{ maxWidth: '100%', height: 'auto' }} />;
}

export function LabelsPage() {
  const [limit, setLimit] = useState(24);
  const [settings, setSettings] = useState<LabelSettings>(loadSettings);

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      /* storage may be unavailable */
    }
  }, [settings]);

  const patch = (next: Partial<LabelSettings>) => setSettings((prev) => ({ ...prev, ...next }));

  const list = useQuery({
    queryKey: ['labels', limit],
    queryFn: () => api.inventoryList({ page: 1, perPage: limit }),
  });

  const headers = (list.data?.headers ?? []) as string[];
  const index = (name: string) => headers.indexOf(name);
  const barcodeAt = index('BARCODE');
  const modelAt = index('MODEL');
  const brandAt = index('BRAND');
  const locationAt = index('LOCATION');
  const binAt = index('BIN_BUCKET');

  const items: LabelItem[] = (list.data?.rows ?? []).map((row) => ({
    barcode: String(row[barcodeAt] ?? ''),
    model: String(row[modelAt] ?? ''),
    brand: String(row[brandAt] ?? ''),
    location: String(row[locationAt] ?? ''),
    bin: String(row[binAt] ?? ''),
  }));

  const preset = SIZE_PRESETS[settings.size];

  return (
    <div className="stack">
      <PageHeader
        title={translate('Labels')}
        subtitle={list.data ? `${items.length} labels ready to print` : 'Print barcode labels for bins and devices.'}
        actions={
          <Button icon={<Printer size={14} />} onClick={() => window.print()}>
            Print
          </Button>
        }
      />

      <style>{`
        @media print {
          .no-print { display: none !important; }
          .label-grid { display: grid; grid-template-columns: repeat(${settings.columns}, 1fr); gap: 4mm; }
          .label-card {
            width: 100%;
            max-width: ${preset.w}mm;
            height: ${preset.h}mm;
            padding: 2mm;
            border: 1px dashed #999;
            break-inside: avoid;
            overflow: hidden;
          }
          .label-card .barcode-svg svg { max-height: ${Math.max(18, preset.h - 10)}mm; }
          body { background: #fff; }
        }
      `}</style>

      <Card className="no-print" title="Label settings" actions={<span className="hint">Saved on this device</span>}>
        <div className="row" style={{ gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ maxWidth: 160 }}>
            <label className="hint" htmlFor="label-limit">How many labels</label>
            <Input
              id="label-limit"
              type="number"
              min={1}
              max={200}
              value={limit}
              onChange={(event) => setLimit(Math.min(200, Math.max(1, Number(event.target.value) || 1)))}
            />
          </div>
          <div style={{ maxWidth: 170 }}>
            <label className="hint" htmlFor="label-size">Label size</label>
            <Select
              id="label-size"
              value={settings.size}
              onChange={(event) => patch({ size: event.target.value as LabelSize })}
            >
              {(Object.keys(SIZE_PRESETS) as LabelSize[]).map((key) => (
                <option key={key} value={key}>
                  {SIZE_PRESETS[key].label}
                </option>
              ))}
            </Select>
          </div>
          <div style={{ maxWidth: 120 }}>
            <label className="hint" htmlFor="label-columns">Columns</label>
            <Select
              id="label-columns"
              value={String(settings.columns)}
              onChange={(event) => patch({ columns: Number(event.target.value) })}
            >
              {[2, 3, 4].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </Select>
          </div>
          <div style={{ maxWidth: 140 }}>
            <label className="hint" htmlFor="label-height">Barcode height</label>
            <Input
              id="label-height"
              type="number"
              min={20}
              max={80}
              value={settings.barcodeHeight}
              onChange={(event) =>
                patch({ barcodeHeight: Math.min(80, Math.max(20, Number(event.target.value) || 42)) })
              }
            />
          </div>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={settings.showBarcodeText}
              onChange={(event) => patch({ showBarcodeText: event.target.checked })}
            />
            Barcode text
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={settings.showIdentity}
              onChange={(event) => patch({ showIdentity: event.target.checked })}
            />
            Brand + model
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={settings.showLocation}
              onChange={(event) => patch({ showLocation: event.target.checked })}
            />
            Location + bin
          </label>
        </div>
        <span className="hint" style={{ display: 'block', marginTop: 8 }}>
          Print dialog me margins "None" aur scale 100% rakho.
        </span>
      </Card>

      {list.isError && <ErrorPanel message={errorMessage(list.error)} onRetry={() => void list.refetch()} />}

      {items.length === 0 ? (
        <EmptyState title="No labels" hint="Inventory me items add karo, phir labels print honge." />
      ) : (
        <div
          className="label-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${settings.columns}, 1fr)`,
            gap: 12,
          }}
        >
          {items.map((item) => (
            <div
              key={item.barcode}
              className="label-card"
              style={{
                border: '1px dashed var(--border)',
                borderRadius: 8,
                padding: 10,
                maxWidth: `${preset.w * 3.78}px`,
                overflow: 'hidden',
              }}
            >
              <div className="barcode-svg">
                <Barcode value={item.barcode} height={settings.barcodeHeight} />
              </div>
              {settings.showBarcodeText && (
                <div className="mono" style={{ fontSize: 12, marginTop: 4 }}>
                  {item.barcode}
                </div>
              )}
              {settings.showIdentity && (
                <div className="muted" style={{ fontSize: 11 }}>
                  {[item.brand, item.model].filter(Boolean).join(' · ')}
                </div>
              )}
              {settings.showLocation && (
                <div className="muted" style={{ fontSize: 11 }}>
                  {[item.location, item.bin].filter(Boolean).join(' · ')}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
