# Portfolio benchmark PDF → audit-style export

## Is an “audit” report the right move?

**Yes, for the flow in `Compare.js`.** Users already label the download “Consent Audit Report”, and the in-app UI is a **portfolio comparison**. A shorter document framed as **scope, evidence, summary metrics, and limitations** matches DPO / compliance expectations better than a long general analytics PDF (experiments, countries, day-by-day charts, etc.).

Keep a **full statistics PDF** for other callers that omit `reportType` or send `reportType: full`.

## Frontend (done in repo)

`Compare.js` now POSTs:

```json
{
  "domains": ["example.com", "…"],
  "reportType": "portfolio_audit"
}
```

## Backend merge steps (`generatePDF.php`)

Your generator lives on the server (not in this git repo). Apply the following there.

### 1. Parse `reportType` early

After `json_decode` of `php://input`:

```php
$reportType = isset($input['reportType']) ? (string) $input['reportType'] : '';
$portfolioAudit = ($reportType === 'portfolio_audit');
```

### 2. Require the snippet after your `PDF` class

Copy `server/portfolioAuditPdfBody.php` from this repo next to `generatePDF.php` (or adjust path), then:

```php
require __DIR__ . '/portfolioAuditPdfBody.php';
```

Place this **after** the `class PDF extends FPDF { ... }` definition so `render_portfolio_audit_report()` can call `AddSectionHeader` on your subclass.

### 3. Branch right after `$pdf = new PDF(...)` and metadata

After you create `$pdf`, set margins/alias as today, then:

```php
if ($portfolioAudit) {
    render_portfolio_audit_report($pdf, $comparingDomain, $domains, $fromDate, $toDate);
    $pdf->Output('I', 'consent-portfolio-audit.pdf');
    exit;
}

// … existing long-form report …
```

Ensure `$comparingDomain` and `$domains` are populated **before** this branch (same as today for a domain list POST).

### 4. Security (important)

A copy of `generatePDF.php` reviewed from a temp folder contained **database credentials inline**. You should:

- Move credentials to **environment variables** or a config file **outside** web root.
- Use **prepared statements** / validated domain allow-lists instead of concatenating `$domain` into SQL (SQL injection risk).

This repo intentionally does **not** commit your full `generatePDF.php`.

## Optional

- Reuse your existing GDPR tables (later in the current file) inside `render_portfolio_audit_report()` if legal wants the same wording.
- Add `reportType: "full"` from other clients explicitly for clarity.
