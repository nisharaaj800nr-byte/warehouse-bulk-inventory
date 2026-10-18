/* Label printing: CODE128 barcodes for shelf/bin labels. */
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import JsBarcode from 'jsbarcode';
import { Printer } from 'lucide-react';
import { api } from '../lib/api';
import { errorMessage } from '../lib/query';
import { Button, Card, EmptyState, ErrorPanel, Input, PageHeader } from '../ui/base';

interface LabelItem {
  barcode: string;
  model: string;
  brand: string;
  location: string;
  bin: string;
}

function Barcode({ value }: { value: string }) {
  const ref = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    try {
      JsBarcode(ref.current, value, {
        format: 'CODE128',
        height: 42,
        width: 1.6,
        fontSize: 12,
        margin: 4,
        displayValue: true,
      });
    } catch {
      /* invalid barcode characters are skipped, the text still prints */
    }
  }, [value]);

  return <svg ref={ref} />;
}

export function LabelsPage() {
  const [limit, setLimit] = useState(24);

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

  return (
    <div className="stack">
      <PageHeader
        title="Labels"
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
          .label-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8mm; }
          .label-card { border: 1px dashed #999; padding: 4mm; break-inside: avoid; }
          body { background: #fff; }
        }
      `}</style>

      <Card className="no-print">
        <div className="row" style={{ gap: 10, alignItems: 'flex-end' }}>
          <div style={{ maxWidth: 160 }}>
            <label className="hint">How many labels</label>
            <Input
              type="number"
              min={1}
              max={200}
              value={limit}
              onChange={(event) => setLimit(Math.min(200, Math.max(1, Number(event.target.value) || 1)))}
            />
          </div>
          <span className="hint" style={{ marginBottom: 6 }}>
            Print dialog me margins "None" aur scale 100% rakho.
          </span>
        </div>
      </Card>

      {list.isError && <ErrorPanel message={errorMessage(list.error)} onRetry={() => void list.refetch()} />}

      {items.length === 0 ? (
        <EmptyState title="No labels" hint="Inventory me items add karo, phir labels print honge." />
      ) : (
        <div className="label-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {items.map((item) => (
            <div key={item.barcode} className="label-card" style={{ border: '1px dashed var(--border)', borderRadius: 8, padding: 10 }}>
              <Barcode value={item.barcode} />
              <div className="mono" style={{ fontSize: 12, marginTop: 4 }}>
                {item.barcode}
              </div>
              <div className="muted" style={{ fontSize: 11 }}>
                {[item.brand, item.model].filter(Boolean).join(' · ')}
              </div>
              <div className="muted" style={{ fontSize: 11 }}>
                {[item.location, item.bin].filter(Boolean).join(' · ')}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
