/* Camera barcode scanner (ZXing) used by the inventory screen. */
import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser';
import { Camera, XCircle } from 'lucide-react';
import { Button } from '../ui/base';
import { Modal } from '../ui/overlay';

export function ScannerModal({
  open,
  onClose,
  onDetect,
}: {
  open: boolean;
  onClose: () => void;
  onDetect: (code: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setError('');
    setStarting(true);

    const reader = new BrowserMultiFormatReader();

    const start = async () => {
      try {
        const video = videoRef.current;
        if (!video) return;

        const controls = await reader.decodeFromVideoDevice(undefined, video, (result) => {
          if (result && !cancelled) {
            cancelled = true;
            onDetect(result.getText());
            controlsRef.current?.stop();
            onClose();
          }
        });
        controlsRef.current = controls;
      } catch (err) {
        setError(
          err instanceof Error
            ? `${err.message}. Allow camera permission and open the app over HTTPS or localhost.`
            : 'Unable to start the camera.'
        );
      } finally {
        setStarting(false);
      }
    };

    void start();

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [open, onClose, onDetect]);

  return (
    <Modal open={open} onClose={onClose} title="Scan barcode" size="md">
      <div className="stack" style={{ gap: 10 }}>
        <div
          style={{
            position: 'relative',
            borderRadius: 12,
            overflow: 'hidden',
            background: '#000',
            aspectRatio: '4 / 3',
          }}
        >
          <video
            ref={videoRef}
            muted
            playsInline
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
          <div
            style={{
              position: 'absolute',
              inset: '18% 12%',
              border: '2px solid rgba(255,255,255,.75)',
              borderRadius: 10,
              pointerEvents: 'none',
            }}
          />
        </div>

        {starting && <p className="hint">Starting camera…</p>}
        {error && (
          <p style={{ color: 'var(--danger)', margin: 0 }}>
            <XCircle size={14} /> {error}
          </p>
        )}
        <p className="hint" style={{ margin: 0 }}>
          Place the barcode inside the frame. The search fills automatically when it is detected.
        </p>
        <div className="row" style={{ gap: 8 }}>
          <Button icon={<Camera size={14} />} onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}
