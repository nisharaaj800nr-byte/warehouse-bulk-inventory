/* Bulk edit by barcode list — paste many barcodes and patch one field. */
import { useState } from 'react';
import { Layers } from 'lucide-react';
import { callApi } from '../lib/api';
import { errorMessage } from '../lib/query';
import { Button, Field, Input, Select } from '../ui/base';
import { Modal, useToast } from '../ui/overlay';

const FIELDS = [
  { key: 'STATUS', label: 'Status' },
  { key: 'STATUS_BUCKET', label: 'Status bucket' },
  { key: 'LOCATION', label: 'Location' },
  { key: 'BIN_BUCKET', label: 'Bin bucket' },
  { key: 'PRIORITY', label: 'Priority' },
] as const;

type FieldKey = (typeof FIELDS)[number]['key'];

export function BulkEditButton({ onDone }: { onDone?: () => void }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [barcodes, setBarcodes] = useState('');
  const [field, setField] = useState<FieldKey>('STATUS_BUCKET');
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);

  const codes = barcodes
    .split(/[\s,;]+/)
    .map((code) => code.trim())
    .filter(Boolean);

  async function apply(): Promise<void> {
    if (codes.length === 0) {
      toast.error('Kam se kam ek barcode daalo.');
      return;
    }
    if (!value.trim()) {
      toast.error('Naya value daalo.');
      return;
    }

    setBusy(true);
    try {
      const result = await callApi<{ matched: number; updated: number }>('inventory.bulkUpdate', {
        barcodes: codes,
        patch: { [field]: value.trim() },
      });
      toast.ok(`${result.updated} rows update hui (${result.matched} match mile).`);
      setOpen(false);
      setBarcodes('');
      setValue('');
      onDone?.();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button size="sm" icon={<Layers size={14} />} onClick={() => setOpen(true)}>
        Bulk edit
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Bulk edit inventory"
        size="md"
        footer={
          <div className="row" style={{ gap: 8 }}>
            <Button onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => void apply()} loading={busy}>
              Apply to {codes.length} item{codes.length === 1 ? '' : 's'}
            </Button>
          </div>
        }
      >
        <div className="stack" style={{ gap: 12 }}>
          <Field label="Barcodes (ek line me ek, ya comma se alag)">
            <textarea
              className="input"
              rows={5}
              value={barcodes}
              onChange={(event) => setBarcodes(event.target.value)}
              placeholder={'BC-1001\nBC-1002\nBC-1003'}
              style={{ width: '100%', fontFamily: 'monospace', resize: 'vertical' }}
            />
          </Field>

          <div className="row" style={{ gap: 10 }}>
            <div style={{ flex: 1 }}>
              <Field label="Field">
                <Select value={field} onChange={(event) => setField(event.target.value as FieldKey)}>
                  {FIELDS.map((item) => (
                    <option key={item.key} value={item.key}>
                      {item.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <div style={{ flex: 1 }}>
              <Field label="New value">
                <Input value={value} onChange={(event) => setValue(event.target.value)} placeholder="e.g. BIN-02" />
              </Field>
            </div>
          </div>

          <p className="hint" style={{ margin: 0 }}>
            Only the fields you select will change; all other data stays as it is. This action is recorded in the audit log.
          </p>
        </div>
      </Modal>
    </>
  );
}
