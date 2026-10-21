import { translate } from '../lib/i18n';
/* Purchasing: vendor master data and purchase orders with receiving. */
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Pencil, Plus, RefreshCw, Trash2, Truck, X } from 'lucide-react';
import { api, type PurchaseOrder, type PurchaseOrderLine, type Vendor } from '../lib/api';
import { errorMessage } from '../lib/query';
import { Badge, Button, Card, EmptyState, Field, Input, PageHeader, Select, Tabs } from '../ui/base';
import { DataTable, type Column } from '../ui/table';
import { ConfirmDialog, Modal, useToast } from '../ui/overlay';
import { fmtDateTime, hasRole } from '../lib/utils';
import { useAuth } from './auth';

interface VendorForm {
  id: number | null;
  name: string;
  contactName: string;
  email: string;
  phone: string;
  address: string;
  notes: string;
  active: boolean;
}

const EMPTY_VENDOR: VendorForm = {
  id: null,
  name: '',
  contactName: '',
  email: '',
  phone: '',
  address: '',
  notes: '',
  active: true,
};

interface LineForm {
  barcode: string;
  model: string;
  brand: string;
  quantity: string;
  unitCost: string;
}

interface PoForm {
  id: number | null;
  vendorId: string;
  status: 'DRAFT' | 'ORDERED';
  expectedAt: string;
  notes: string;
  lines: LineForm[];
}

const EMPTY_LINE: LineForm = { barcode: '', model: '', brand: '', quantity: '1', unitCost: '' };
const EMPTY_PO: PoForm = { id: null, vendorId: '', status: 'DRAFT', expectedAt: '', notes: '', lines: [{ ...EMPTY_LINE }] };

function statusTone(status: string): 'ok' | 'warn' | 'danger' | 'info' | 'neutral' {
  if (status === 'RECEIVED') return 'ok';
  if (status === 'PARTIAL') return 'warn';
  if (status === 'CANCELLED') return 'danger';
  if (status === 'ORDERED') return 'info';
  return 'neutral';
}

export function PurchasingPage() {
  const toast = useToast();
  const { session } = useAuth();
  const canAdmin = hasRole(session?.role, 'ADMIN');
  const canOperate = hasRole(session?.role, 'OPERATOR');

  const [tab, setTab] = useState<'vendors' | 'orders'>('orders');

  const vendors = useQuery({ queryKey: ['vendors'], queryFn: () => api.vendorsList() });
  const orders = useQuery({ queryKey: ['purchaseOrders'], queryFn: () => api.poList() });

  /* ---------- vendor form ---------- */
  const [vendorForm, setVendorForm] = useState<VendorForm>(EMPTY_VENDOR);
  const [vendorOpen, setVendorOpen] = useState(false);
  const [vendorDelete, setVendorDelete] = useState<Vendor | null>(null);

  const saveVendor = useMutation({
    mutationFn: () =>
      api.vendorSave({
        ...(vendorForm.id ? { id: vendorForm.id } : {}),
        name: vendorForm.name.trim(),
        contactName: vendorForm.contactName.trim(),
        email: vendorForm.email.trim(),
        phone: vendorForm.phone.trim(),
        address: vendorForm.address.trim(),
        notes: vendorForm.notes.trim(),
        active: vendorForm.active,
      }),
    onSuccess: () => {
      toast.ok('Vendor saved.');
      setVendorOpen(false);
      void vendors.refetch();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const removeVendor = useMutation({
    mutationFn: (id: number) => api.vendorDelete(id),
    onSuccess: () => {
      toast.ok('Vendor deleted.');
      setVendorDelete(null);
      void vendors.refetch();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  /* ---------- purchase order form ---------- */
  const [poForm, setPoForm] = useState<PoForm>(EMPTY_PO);
  const [poOpen, setPoOpen] = useState(false);
  const [receiveId, setReceiveId] = useState<number | null>(null);
  const [receiveQty, setReceiveQty] = useState<Record<number, string>>({});
  const [cancelFor, setCancelFor] = useState<PurchaseOrder | null>(null);

  const vendorOptions = vendors.data ?? [];

  const savePo = useMutation({
    mutationFn: () =>
      api.poSave({
        ...(poForm.id ? { id: poForm.id } : {}),
        vendorId: Number(poForm.vendorId),
        status: poForm.status,
        expectedAt: poForm.expectedAt || undefined,
        notes: poForm.notes.trim(),
        lines: poForm.lines
          .filter((line) => line.model.trim() || line.barcode.trim())
          .map((line) => ({
            barcode: line.barcode.trim(),
            model: line.model.trim(),
            brand: line.brand.trim(),
            quantity: Number(line.quantity) || 0,
            ...(line.unitCost.trim() ? { unitCost: Number(line.unitCost) } : {}),
          })),
      }),
    onSuccess: () => {
      toast.ok('Purchase order saved.');
      setPoOpen(false);
      void orders.refetch();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const receive = useMutation({
    mutationFn: () =>
      api.poReceive(
        Number(receiveId),
        Object.entries(receiveQty)
          .map(([lineId, quantity]) => ({ lineId: Number(lineId), quantity: Number(quantity) || 0 }))
          .filter((line) => line.quantity > 0)
      ),
    onSuccess: (result) => {
      toast.ok(`Received ${result.received} unit(s). Order is now ${result.status}.`);
      setReceiveId(null);
      setReceiveQty({});
      void orders.refetch();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const cancel = useMutation({
    mutationFn: (id: number) => api.poCancel(id),
    onSuccess: () => {
      toast.ok('Purchase order cancelled.');
      setCancelFor(null);
      void orders.refetch();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const receiveOrder = useQuery({
    queryKey: ['purchaseOrder', receiveId],
    queryFn: () => api.poGet(Number(receiveId)),
    enabled: !!receiveId,
  });

  useEffect(() => {
    if (!receiveOrder.data || !receiveId) return;
    const next: Record<number, string> = {};
    for (const line of receiveOrder.data.lines ?? []) {
      next[line.id] = '';
    }
    setReceiveQty(next);
  }, [receiveOrder.data, receiveId]);

  const openNewVendor = () => {
    setVendorForm(EMPTY_VENDOR);
    setVendorOpen(true);
  };

  const openEditVendor = (vendor: Vendor) => {
    setVendorForm({
      id: vendor.id,
      name: vendor.name,
      contactName: vendor.contactName,
      email: vendor.email,
      phone: vendor.phone,
      address: vendor.address,
      notes: vendor.notes,
      active: vendor.active,
    });
    setVendorOpen(true);
  };

  const openNewPo = () => {
    setPoForm({ ...EMPTY_PO, lines: [{ ...EMPTY_LINE }], vendorId: String(vendorOptions[0]?.id ?? '') });
    setPoOpen(true);
  };

  const setLine = (index: number, patch: Partial<LineForm>) => {
    setPoForm((prev) => ({
      ...prev,
      lines: prev.lines.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    }));
  };

  const vendorCols: Column<Vendor>[] = [
    { key: 'name', label: 'Vendor', render: (row) => <strong>{row.name}</strong> },
    { key: 'contact', label: 'Contact', render: (row) => row.contactName || '—' },
    { key: 'email', label: 'Email', render: (row) => row.email || '—' },
    { key: 'phone', label: 'Phone', render: (row) => row.phone || '—' },
    {
      key: 'status',
      label: 'Status',
      render: (row) => <Badge tone={row.active ? 'ok' : 'neutral'}>{row.active ? 'Active' : 'Inactive'}</Badge>,
    },
    {
      key: 'actions',
      label: '',
      align: 'right',
      render: (row) => (
        <span className="row" style={{ gap: 4, justifyContent: 'flex-end' }}>
          <Button size="icon" variant="ghost" aria-label="Edit vendor" disabled={!canAdmin} onClick={() => openEditVendor(row)}>
            <Pencil size={14} />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Delete vendor"
            disabled={!canAdmin}
            onClick={() => setVendorDelete(row)}
          >
            <Trash2 size={14} />
          </Button>
        </span>
      ),
    },
  ];

  const orderCols: Column<PurchaseOrder>[] = [
    { key: 'po', label: 'PO', render: (row) => <span className="mono">{row.poNumber}</span> },
    { key: 'vendor', label: 'Vendor', render: (row) => row.vendorName },
    { key: 'status', label: 'Status', render: (row) => <Badge tone={statusTone(row.status)}>{row.status}</Badge> },
    { key: 'lines', label: 'Lines', align: 'right', render: (row) => row.lineCount },
    { key: 'ordered', label: 'Ordered', align: 'right', render: (row) => row.orderedQuantity },
    { key: 'received', label: 'Received', align: 'right', render: (row) => row.receivedQuantity },
    {
      key: 'expected',
      label: 'Expected',
      render: (row) => (row.expectedAt ? fmtDateTime(row.expectedAt) || row.expectedAt : '—'),
    },
    {
      key: 'actions',
      label: '',
      align: 'right',
      render: (row) => (
        <span className="row" style={{ gap: 4, justifyContent: 'flex-end' }}>
          {(row.status === 'ORDERED' || row.status === 'PARTIAL') && (
            <Button
              size="sm"
              variant="ghost"
              disabled={!canOperate}
              onClick={() => {
                setReceiveQty({});
                setReceiveId(row.id);
              }}
            >
              Receive
            </Button>
          )}
          {row.status !== 'RECEIVED' && row.status !== 'CANCELLED' && (
            <Button size="icon" variant="ghost" aria-label="Cancel order" disabled={!canOperate} onClick={() => setCancelFor(row)}>
              <X size={14} />
            </Button>
          )}
        </span>
      ),
    },
  ];

  const lines = receiveOrder.data?.lines ?? [];
  const remaining = (line: PurchaseOrderLine) => line.quantity - line.receivedQuantity;

  const totals = useMemo(() => {
    const ordered = orders.data?.reduce((sum, row) => sum + row.orderedQuantity, 0) ?? 0;
    const received = orders.data?.reduce((sum, row) => sum + row.receivedQuantity, 0) ?? 0;
    return { ordered, received };
  }, [orders.data]);

  return (
    <div className="stack">
      <PageHeader
        title={translate('Purchasing')}
        subtitle={`Vendors and purchase orders · ${totals.received}/${totals.ordered} units received`}
        actions={
          <>
            <Button
              icon={<RefreshCw size={14} />}
              loading={vendors.isFetching || orders.isFetching}
              onClick={() => {
                void vendors.refetch();
                void orders.refetch();
              }}
            >
              Refresh
            </Button>
            {tab === 'vendors' ? (
              <Button variant="primary" icon={<Plus size={14} />} disabled={!canAdmin} onClick={openNewVendor}>
                New vendor
              </Button>
            ) : (
              <Button
                variant="primary"
                icon={<Plus size={14} />}
                disabled={!canOperate || vendorOptions.length === 0}
                onClick={openNewPo}
              >
                New purchase order
              </Button>
            )}
          </>
        }
      />

      <Tabs
        tabs={[
          { key: 'orders', label: 'Purchase orders' },
          { key: 'vendors', label: 'Vendors' },
        ]}
        active={tab}
        onChange={(key) => setTab(key as 'vendors' | 'orders')}
      />

      {tab === 'vendors' ? (
        <Card
          title={
            <span className="row" style={{ gap: 8 }}>
              <Truck size={16} /> Vendors
            </span>
          }
          noBody
        >
          <DataTable
            columns={vendorCols}
            rows={vendorOptions}
            rowKey={(row) => String(row.id)}
            loading={vendors.isLoading}
            empty={<EmptyState title="No vendors" hint="Add your first supplier to start raising purchase orders." />}
          />
        </Card>
      ) : (
        <Card title="Purchase orders" noBody>
          <DataTable
            columns={orderCols}
            rows={orders.data ?? []}
            rowKey={(row) => String(row.id)}
            loading={orders.isLoading}
            empty={
              <EmptyState
                title="No purchase orders"
                hint={vendorOptions.length === 0 ? 'Add a vendor first.' : 'Create a purchase order to order stock.'}
              />
            }
          />
        </Card>
      )}

      {/* Vendor modal */}
      <Modal
        open={vendorOpen}
        onClose={() => setVendorOpen(false)}
        title={vendorForm.id ? 'Edit vendor' : 'New vendor'}
        size="lg"
        footer={
          <>
            <Button onClick={() => setVendorOpen(false)} disabled={saveVendor.isPending}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={saveVendor.isPending}
              disabled={!vendorForm.name.trim()}
              onClick={() => saveVendor.mutate()}
            >
              Save vendor
            </Button>
          </>
        }
      >
        <div className="form-grid">
          <Field label="Name" span2>
            <Input
              value={vendorForm.name}
              placeholder="e.g. Acme Supplies"
              onChange={(event) => setVendorForm((prev) => ({ ...prev, name: event.target.value }))}
            />
          </Field>
          <Field label="Contact person">
            <Input
              value={vendorForm.contactName}
              placeholder="e.g. Rajesh Kumar"
              onChange={(event) => setVendorForm((prev) => ({ ...prev, contactName: event.target.value }))}
            />
          </Field>
          <Field label="Email">
            <Input
              type="email"
              value={vendorForm.email}
              placeholder="vendor@example.com"
              onChange={(event) => setVendorForm((prev) => ({ ...prev, email: event.target.value }))}
            />
          </Field>
          <Field label="Phone">
            <Input
              value={vendorForm.phone}
              placeholder="+91 98765 43210"
              onChange={(event) => setVendorForm((prev) => ({ ...prev, phone: event.target.value }))}
            />
          </Field>
          <Field label="Address">
            <Input
              value={vendorForm.address}
              placeholder="City, state"
              onChange={(event) => setVendorForm((prev) => ({ ...prev, address: event.target.value }))}
            />
          </Field>
          <Field label="Notes" span2>
            <Input
              value={vendorForm.notes}
              placeholder="Payment terms, delivery notes…"
              onChange={(event) => setVendorForm((prev) => ({ ...prev, notes: event.target.value }))}
            />
          </Field>
          <label className="checkbox span2">
            <input
              type="checkbox"
              checked={vendorForm.active}
              onChange={(event) => setVendorForm((prev) => ({ ...prev, active: event.target.checked }))}
            />
            Active
          </label>
        </div>
      </Modal>

      {/* Purchase order modal */}
      <Modal
        open={poOpen}
        onClose={() => setPoOpen(false)}
        title="New purchase order"
        size="lg"
        footer={
          <>
            <Button onClick={() => setPoOpen(false)} disabled={savePo.isPending}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={savePo.isPending}
              disabled={!poForm.vendorId || poForm.lines.every((line) => !line.model.trim() && !line.barcode.trim())}
              onClick={() => savePo.mutate()}
            >
              Save order
            </Button>
          </>
        }
      >
        <div className="form-grid">
          <Field label="Vendor">
            <Select
              value={poForm.vendorId}
              onChange={(event) => setPoForm((prev) => ({ ...prev, vendorId: event.target.value }))}
            >
              <option value="">Select vendor…</option>
              {vendorOptions.map((vendor) => (
                <option key={vendor.id} value={vendor.id}>
                  {vendor.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Status">
            <Select
              value={poForm.status}
              onChange={(event) => setPoForm((prev) => ({ ...prev, status: event.target.value as 'DRAFT' | 'ORDERED' }))}
            >
              <option value="DRAFT">Draft</option>
              <option value="ORDERED">Ordered</option>
            </Select>
          </Field>
          <Field label="Expected date">
            <Input
              type="date"
              value={poForm.expectedAt}
              onChange={(event) => setPoForm((prev) => ({ ...prev, expectedAt: event.target.value }))}
            />
          </Field>
          <Field label="Notes">
            <Input
              value={poForm.notes}
              placeholder="e.g. Urgent restock"
              onChange={(event) => setPoForm((prev) => ({ ...prev, notes: event.target.value }))}
            />
          </Field>
        </div>

        <div className="spread" style={{ margin: '14px 0 8px' }}>
          <strong>Lines</strong>
          <Button
            size="sm"
            icon={<Plus size={13} />}
            onClick={() => setPoForm((prev) => ({ ...prev, lines: [...prev.lines, { ...EMPTY_LINE }] }))}
          >
            Add line
          </Button>
        </div>

        <div className="stack" style={{ gap: 8 }}>
          {poForm.lines.map((line, index) => (
            <div key={index} className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={{ flex: '1 1 140px' }}>
                <label className="hint">Barcode (optional)</label>
                <Input value={line.barcode} placeholder="e.g. BR-1001 (optional)" onChange={(event) => setLine(index, { barcode: event.target.value })} />
              </div>
              <div style={{ flex: '1 1 150px' }}>
                <label className="hint">Model</label>
                <Input value={line.model} placeholder="e.g. iPhone 13" onChange={(event) => setLine(index, { model: event.target.value })} />
              </div>
              <div style={{ flex: '1 1 110px' }}>
                <label className="hint">Brand</label>
                <Input value={line.brand} placeholder="e.g. Apple" onChange={(event) => setLine(index, { brand: event.target.value })} />
              </div>
              <div style={{ width: 80 }}>
                <label className="hint">Qty</label>
                <Input
                  type="number"
                  min={1}
                  value={line.quantity}
                  onChange={(event) => setLine(index, { quantity: event.target.value })}
                />
              </div>
              <div style={{ width: 100 }}>
                <label className="hint">Unit cost</label>
                <Input
                  type="number"
                  min={0}
                  value={line.unitCost}
                  onChange={(event) => setLine(index, { unitCost: event.target.value })}
                />
              </div>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Remove line"
                disabled={poForm.lines.length === 1}
                onClick={() =>
                  setPoForm((prev) => ({ ...prev, lines: prev.lines.filter((_, i) => i !== index) }))
                }
              >
                <Trash2 size={14} />
              </Button>
            </div>
          ))}
        </div>
      </Modal>

      {/* Receive modal */}
      <Modal
        open={!!receiveId}
        onClose={() => setReceiveId(null)}
        title={`Receive — ${receiveOrder.data?.poNumber ?? ''}`}
        size="lg"
        footer={
          <>
            <Button onClick={() => setReceiveId(null)} disabled={receive.isPending}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={receive.isPending}
              disabled={Object.values(receiveQty).every((value) => !Number(value))}
              onClick={() => receive.mutate()}
            >
              Receive stock
            </Button>
          </>
        }
      >
        {receiveOrder.isLoading ? (
          <span className="hint">Loading lines…</span>
        ) : (
          <div className="stack" style={{ gap: 10 }}>
            <span className="hint">
              Lines with a barcode are written into inventory when received. Others only update the received count.
            </span>
            {lines.map((line) => (
              <div key={line.id} className="spread" style={{ gap: 12, alignItems: 'flex-end' }}>
                <div>
                  <div>
                    <strong>{line.model || line.barcode || `Line ${line.id}`}</strong>{' '}
                    <span className="muted">{line.brand}</span>
                  </div>
                  <div className="hint">
                    ordered {line.quantity} · received {line.receivedQuantity} · remaining {remaining(line)}
                  </div>
                </div>
                <div style={{ width: 110 }}>
                  <label className="hint">Receive now</label>
                  <Input
                    type="number"
                    min={0}
                    max={remaining(line)}
                    placeholder="0"
                    value={receiveQty[line.id] ?? ''}
                    onChange={(event) =>
                      setReceiveQty((prev) => ({ ...prev, [line.id]: event.target.value }))
                    }
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!vendorDelete}
        title="Delete vendor"
        confirmLabel="Delete"
        tone="danger"
        loading={removeVendor.isPending}
        message={
          <>
            Delete <strong>{vendorDelete?.name ?? ''}</strong>? Vendors with purchase orders cannot be deleted.
          </>
        }
        onCancel={() => setVendorDelete(null)}
        onConfirm={() => {
          if (vendorDelete) removeVendor.mutate(vendorDelete.id);
        }}
      />

      <ConfirmDialog
        open={!!cancelFor}
        title="Cancel purchase order"
        confirmLabel="Cancel order"
        tone="danger"
        loading={cancel.isPending}
        message={
          <>
            Cancel <strong>{cancelFor?.poNumber ?? ''}</strong>? Orders with received stock cannot be cancelled.
          </>
        }
        onCancel={() => setCancelFor(null)}
        onConfirm={() => {
          if (cancelFor) cancel.mutate(cancelFor.id);
        }}
      />
    </div>
  );
}
