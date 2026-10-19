/* AI Assistant: natural-language commands routed through the rules engine. */
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import { api } from '../lib/api';
import { errorMessage } from '../lib/query';
import { hasRole } from '../lib/utils';
import { Badge, Button, Card, PageHeader, Textarea } from '../ui/base';
import { useToast } from '../ui/overlay';
import { useAuth } from './auth';

const EXAMPLES = [
  'Show today\'s inventory summary',
  'List Apple devices older than 75 days',
  'How many devices are in Bin Storage?',
];

export function AssistantPage() {
  const toast = useToast();
  const { session } = useAuth();
  const canRun = hasRole(session?.role, 'OPERATOR');
  const [text, setText] = useState('');
  const [result, setResult] = useState<Record<string, unknown> | null>(null);

  const run = useMutation({
    mutationFn: () => api.aiCommand(text.trim()),
    onSuccess: (res) => {
      setResult(res);
      const ok = res['success'] !== false;
      if (ok) toast.ok('Command executed.');
      else toast.warn(String(res['message'] ?? 'Command not recognized.'));
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <div className="stack">
      <PageHeader
        title="AI Assistant"
        subtitle="Natural-language commands (Hindi / English) — executed through the configured rules engine."
      />
      <Card
        title={
          <span className="row" style={{ gap: 8 }}>
            <Sparkles size={16} /> Command
          </span>
        }
      >
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder='e.g. "List Apple devices older than 75 days"'
          style={{ minHeight: 110 }}
        />
        <div className="row" style={{ gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          {EXAMPLES.map((ex) => (
            <Button key={ex} size="sm" variant="ghost" onClick={() => setText(ex)}>
              {ex}
            </Button>
          ))}
          <div className="grow" />
          <Button
            variant="primary"
            icon={<Sparkles size={14} />}
            loading={run.isPending}
            disabled={!canRun || !text.trim()}
            onClick={() => run.mutate()}
          >
            Run command
          </Button>
        </div>
        {!canRun && <p className="hint">Your role cannot run commands (needs OPERATOR+).</p>}
      </Card>
      {result && (
        <Card title="Result">
          <div className="row" style={{ gap: 10, marginBottom: 8 }}>
            <Badge tone={result['success'] === false ? 'danger' : 'ok'}>
              {result['success'] === false ? 'Not recognized' : 'Done'}
            </Badge>
            {typeof result['message'] === 'string' && <span>{result['message']}</span>}
          </div>
          <pre className="mono" style={{ whiteSpace: 'pre-wrap', margin: 0, color: 'var(--muted)' }}>
            {JSON.stringify(result, null, 2)}
          </pre>
        </Card>
      )}
    </div>
  );
}
