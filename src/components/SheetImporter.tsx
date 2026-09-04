import { useState, type FormEvent } from 'react';
import './SheetImporter.css';

type ImportResult = { imported: number; skipped: number; rows: number };

export default function SheetImporter() {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const response = await fetch('/api/dev/import-google-sheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const body = await response.json() as ImportResult & { error?: string };
      if (!response.ok) throw new Error(body.error || 'The sheet could not be imported.');
      setResult(body);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The sheet could not be imported.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="sheet-importer" aria-labelledby="sheet-importer-title">
      <button className="sheet-importer__toggle" type="button" onClick={() => setOpen((current) => !current)} aria-expanded={open}>
        <span id="sheet-importer-title">Question sheet importer</span>
        <span aria-hidden="true">{open ? 'Close' : 'Open'}</span>
      </button>
      {open && (
        <div className="sheet-importer__body">
          <p>Local development only. Share the sheet with anyone who has the link, then paste its URL below.</p>
          <details>
            <summary>Required sheet columns</summary>
            <code>topic, label, context, prompt, answer_short, answer_explanation, source_1_title, source_1_publisher, source_1_url</code>
            <p>Optional second and third sources use the same names with <code>source_2_</code> and <code>source_3_</code>.</p>
            <a href="/api/dev/question-sheet-template" download="oddly-specific-question-template.csv">Download CSV header</a>
          </details>
          <form onSubmit={submit}>
            <label htmlFor="question-sheet-url">Google Sheet URL</label>
            <div className="sheet-importer__control">
              <input
                id="question-sheet-url"
                type="url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/..."
                required
                disabled={loading}
              />
              <button type="submit" disabled={loading}>{loading ? 'Importing...' : 'Import questions'}</button>
            </div>
          </form>
          {error && <p className="sheet-importer__message sheet-importer__message--error" role="alert">{error}</p>}
          {result && (
            <p className="sheet-importer__message" role="status">
              Imported {result.imported} of {result.rows} rows. {result.skipped} existing {result.skipped === 1 ? 'row was' : 'rows were'} skipped.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
