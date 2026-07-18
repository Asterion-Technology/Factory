# StopAllCalls — Software Requirements Specification

**Secure Cloudflare-Native Cease-and-Desist Intake, Matter Creation, and Letter Workflow**

> Converted to Markdown from `SRS-original.docx` (attached to Linear issue AST-167). Content is unchanged; formatting restored for repo use.

## Document Control

| Field | Value |
|---|---|
| Product | StopAllCalls.com |
| Document type | Build-ready Software Requirements Specification (SRS) |
| Target implementers | Claude Code, Cursor, or a local software development team |
| Version | 1.0 |
| Date | July 10, 2026 |
| System of record | Clio Manage |
| Application role | Workflow orchestration, intake, verification, document generation, approval, delivery, and status tracking |

**CONFIDENTIAL — contains security and legal-workflow design information**

## 1. Executive Summary

StopAllCalls is a consumer-facing legal-service application that accepts intake information and evidence, verifies identity, performs a Clio-assisted conflict review, obtains a limited-scope retainer and payment, creates one Clio contact and one separate Clio matter for each collection agency, generates a cease-and-desist communication letter, routes it through a mandatory lawyer approval queue, sends the approved letter, and records delivery and follow-up activity.

The application controls the workflow. Clio Manage remains the official system of record for contacts, matters, notes, documents, billing references, and the legal audit trail. The application must never autonomously decide that a legal conflict is cleared, determine that a person has a legal claim, or send a legal letter without an authorized human approval.

### 1.1 MVP outcome

- A consumer can submit one intake containing one or more collection agencies.
- The system stores evidence securely, verifies required gates, and creates one independent matter per agency.
- A lawyer can review, edit, approve, reject, and send a separate letter for each matter.
- All external side effects are idempotent, auditable, retryable, and visible to authorized staff.
- The entire application can run locally with mocked integrations and deploy to Cloudflare without redesign.

### 1.2 Non-negotiable workflow gates

| Gate | Passing condition | Failure behavior |
|---|---|---|
| Evidence | At least one acceptable proof item or approved consumer attestation; staff verifies evidence before letter approval. | Block letter generation or route to manual review. |
| Conflict | Authorized lawyer/staff records "cleared" after reviewing Clio search results. | Possible conflict pauses the intake; confirmed conflict closes it without matter creation. |
| Identity | Vendor reports verified, or authorized staff records a documented manual override. | Failed or inconclusive result enters manual review. |
| Retainer | Current retainer version is signed and immutable evidence is stored. | No invoice finalization, matter opening, or letter sending. |
| Payment | Card/debit authorization is confirmed, or EMT receipt is manually confirmed. | No matter creation or letter sending. |
| Legal approval | Authorized lawyer approves the exact immutable letter version being sent. | No outbound email, mail, fax, or API delivery. |

## 2. Product Scope

### 2.1 In scope for MVP

- Public landing page and multi-step intake.
- One consumer profile per intake, with unlimited collection-agency entries subject to configurable limits.
- Direct and resumable evidence uploads.
- Identity-verification provider integration.
- Clio OAuth integration, contact search/create/update, matter creation, document upload, notes, tasks, and custom-field mapping.
- Conflict-search workspace with human disposition.
- Versioned limited-scope retainer and electronic signature.
- Invoice calculation and card/debit or EMT workflow.
- Template-based letter generation with optional AI-assisted drafting.
- Lawyer review queue and immutable approval record.
- Email delivery with client BCC where configured, delivery logging, and follow-up tasks.
- Consumer dashboard and staff administration portal.
- Audit trail, observability, data retention, export, and deletion workflow.

### 2.2 Explicitly out of scope for MVP

- Autonomous legal advice, conflict clearance, litigation screening, or determination of statutory violations.
- Automatic litigation filing, court integrations, debt settlement, credit repair, or lawsuit defense.
- Automatic OCR-based legal conclusions. OCR extraction may be introduced only as a reviewed assistive feature.
- Automatic sending based solely on AI output.
- Using Clio as the transient workflow engine or as the only data store.
- Storing raw card numbers, CVV values, identity-vendor biometric templates, or plaintext secrets.

### 2.3 Architecture decision

The canonical model is one application Client, one Clio contact, and one separate Matter/Clio matter per collection agency. A shared intake may produce multiple matters, invoices/line items, letters, delivery records, and follow-up tasks.

## 3. Users, Roles, and Authorization

| Role | Capabilities | Restrictions |
|---|---|---|
| Consumer | Create/resume own intake, add agencies, upload evidence, complete verification, sign retainer, select payment, view status. | No access to internal notes, conflicts, other consumers, draft legal analysis, or staff audit data. |
| Intake staff | Review intake completeness, evidence, identity exceptions, and contact data. | Cannot clear conflicts or approve/send letters unless separately authorized. |
| Lawyer | Review conflicts, edit/approve/reject letters, authorize delivery, view all matter data. | Cannot approve a version that changed after approval. |
| Billing staff | Manage invoice/payment status and confirm EMT receipt. | No legal approval authority by default. |
| Administrator | Configure templates, pricing, integration mappings, retention rules, and users. | Cannot silently alter historical signed/approved artifacts. |
| Auditor/read-only | Read records, logs, and exports. | No mutation or delivery permissions. |
| Service account | Perform narrowly scoped integration jobs. | No interactive login; least-privilege tokens only. |

- **AUTH-001** All staff authorization shall be server-side and role/permission based; UI hiding is not an authorization control.
- **AUTH-002** The staff portal shall be protected by Cloudflare Access with the firm identity provider, MFA, and device/session policies.
- **AUTH-003** Consumer sessions shall use secure, HttpOnly, SameSite cookies and step-up verification before exposing sensitive documents.
- **AUTH-004** Privileged actions—conflict disposition, manual identity override, EMT confirmation, template publication, approval, sending, export, and deletion—shall require explicit permissions and audit events.
- **AUTH-005** Production access shall be separated from local/development access; production data shall never be copied into developer environments.

## 4. End-to-End Workflow and State Machines

### 4.1 Intake state

`DRAFT → SUBMITTED → EVIDENCE_REVIEW → CONFLICT_REVIEW → IDENTITY_REVIEW → RETAINER_PENDING → PAYMENT_PENDING → READY_TO_OPEN → OPENED → CLOSED`

Exceptional states: `NEEDS_INFORMATION`, `MANUAL_REVIEW`, `CONFLICT_BLOCKED`, `PAYMENT_FAILED`, `CANCELLED`.

### 4.2 Matter/letter state

`MATTER_PENDING → MATTER_CREATED → DRAFT_PENDING → DRAFT_READY → IN_REVIEW → CHANGES_REQUESTED → APPROVED → DELIVERY_QUEUED → SENT → DELIVERED/BOUNCED → FOLLOW_UP_DUE → CLOSED`

- **WF-001** State transitions shall be validated in one server-side transition service; clients may request but may not assign arbitrary states.
- **WF-002** Each transition shall record actor, timestamp, prior state, new state, reason, correlation ID, and relevant artifact version.
- **WF-003** Every job that calls an external service shall use an idempotency key and persist attempt/result metadata.
- **WF-004** A partial failure while creating multiple matters shall not duplicate successful contacts, matters, invoices, documents, or letters on retry.
- **WF-005** The send command shall atomically bind approval to a letter_content_hash; any content change invalidates approval.
- **WF-006** A conflict-blocked intake shall not create Clio matters or expose conflict details to the consumer.
- **WF-007** The system shall support staff cancellation and consumer withdrawal with documented downstream effects.

### 4.3 Primary sequence

1. Consumer opens StopAllCalls.com and starts an intake.
2. Consumer verifies email or phone and receives a resumable secure session.
3. Consumer enters profile and one or more collection agencies.
4. Consumer uploads evidence and optionally a credit report.
5. Consumer signs attestations and submits.
6. System creates a conflict-search package; authorized staff/lawyer reviews Clio results.
7. After conflict clearance, consumer completes identity verification.
8. Consumer signs the current limited-scope retainer.
9. System calculates fee per agency and creates payment/invoice workflow.
10. After confirmed payment condition, system searches/creates one Clio contact.
11. System creates one Clio matter per agency and uploads the relevant records.
12. System generates one letter draft per matter.
13. Lawyer reviews the exact rendered letter and approves or requests changes.
14. Approved letter is delivered; delivery details are written to the local audit store and Clio.
15. System schedules follow-up and optional Phase 2 review invitation.

## 5. Functional Requirements

### 5.1 Public site and intake

- **INT-001** The landing page shall display the approved service description, jurisdiction-specific disclaimer, privacy notice link, accessibility statement, and Start Intake action.
- **INT-002** The intake shall be mobile-first, keyboard accessible, save after each step, and resume by verified magic link or one-time code.
- **INT-003** The consumer profile shall collect legal name, DOB, email, phone, address, city, province/state, postal/ZIP, country, and preferred contact method.
- **INT-004** The consumer may add, edit, remove, and duplicate agency entries before submission; the configured maximum shall default to 20.
- **INT-005** Each agency entry shall collect agency identity/contact information, original creditor, debt buyer, masked account number, balance, contact dates, contact channels, frequency, and allegations selected by the consumer.
- **INT-006** Validation shall distinguish required, optional, unknown, and not-applicable values; it shall not force fabricated data.
- **INT-007** Submission shall create an immutable snapshot while allowing later supplemental information as separately versioned amendments.
- **INT-008** The application shall prevent duplicate rapid submissions and shall use Turnstile plus server-side abuse controls.

### 5.2 Evidence and credit reports

- **EVD-001** Accepted categories shall include collection letter, screenshot, call log, voicemail, email/text, credit report, and signed consumer attestation.
- **EVD-002** Evidence shall be associated with the intake and, where applicable, one or more agency matters.
- **EVD-003** Uploads shall use short-lived signed URLs directly to private R2 storage; application servers shall not buffer large files.
- **EVD-004** Allowed extensions, MIME signatures, maximum file size, total quota, and audio duration shall be configurable and validated server-side.
- **EVD-005** Every upload shall enter QUARANTINED status, be malware-scanned by an asynchronous worker/integration, and remain unavailable for staff download until clean.
- **EVD-006** Original filename shall be treated as untrusted display text; storage keys shall be random and non-guessable.
- **EVD-007** The system shall compute SHA-256, size, MIME, uploader, upload time, and chain-of-custody events for every object.
- **EVD-008** Credit reports shall be stored as sensitive evidence; structured extraction is deferred unless separately enabled and reviewed.
- **EVD-009** MVP evidence sufficiency shall be rule based: at least one approved proof item per matter, or an allowed attestation that is flagged for lawyer review.
- **EVD-010** No proof or unverified evidence shall prevent letter approval unless an authorized lawyer records a reasoned override.

### 5.3 Identity verification

- **IDV-001** Identity verification shall be performed through a provider-hosted or provider-SDK flow; raw biometric templates shall not be stored by StopAllCalls.
- **IDV-002** The local record shall store provider reference, status, timestamps, checks performed, redacted match results, and webhook event IDs.
- **IDV-003** Provider webhooks shall be signature verified, replay protected, idempotent, and processed asynchronously.
- **IDV-004** Name, DOB, and address mismatches shall route to manual review rather than automatically reject legal eligibility.
- **IDV-005** Manual overrides shall require elevated permission, reason code, free-text rationale, and second-person review when configured.
- **IDV-006** Government ID images shall remain at the identity provider where feasible; if retained locally, they require separate encryption keys and shorter retention.

### 5.4 Conflict review and Clio

- **CLIO-001** Clio integration shall use OAuth 2.0; tokens shall be encrypted, refreshable, revocable, and never exposed to browsers.
- **CLIO-002** The system shall search Clio using consumer name, aliases, email, phone, agency, original creditor, debt buyer, and configured related-company terms.
- **CLIO-003** Search results shall be displayed to authorized staff as a review aid; only a human may record CLEAR, POSSIBLE_CONFLICT, or CONFLICT_FOUND.
- **CLIO-004** The integration shall search for an existing contact before create and use local-to-Clio mapping records to avoid duplicates.
- **CLIO-005** One Clio contact shall be associated with all matters produced by the intake.
- **CLIO-006** One Clio matter shall be created per collection agency using the naming pattern "[Last], [First] v. [Collection Agency]".
- **CLIO-007** Contact and matter custom-field mappings shall be configuration driven and validated at startup/health check.
- **CLIO-008** Documents, notes, tasks, and status updates sent to Clio shall carry deterministic idempotency metadata in the local integration ledger.
- **CLIO-009** Clio API failures shall not lose local workflow state; retryable failures go to a queue and permanent failures require staff resolution.
- **CLIO-010** Clio remains the official legal system of record, but the application remains authoritative for workflow state and integration attempts.

### 5.5 Retainer and signature

- **RET-001** The retainer shall be versioned by jurisdiction, language, effective date, and content hash.
- **RET-002** The consumer shall view the complete retainer before signing and explicitly accept required consent checkboxes.
- **RET-003** Signature evidence shall include signer identity reference, timestamp, IP-derived security metadata where permitted, user agent, retainer version/hash, and provider envelope ID.
- **RET-004** Published retainer templates shall be immutable; edits create a new version.
- **RET-005** The workflow shall block payment completion/matter opening when the signed version is missing or invalid.

### 5.6 Pricing, invoice, and payment

- **PAY-001** Pricing shall be configuration driven: base fee for the first agency, additional fee per added agency, taxes, discounts, and jurisdiction/currency.
- **PAY-002** The server shall calculate totals; the browser-provided total shall never be trusted.
- **PAY-003** Card and debit payments shall use hosted payment fields/pages so StopAllCalls does not handle raw PAN or CVV data.
- **PAY-004** Payment webhooks shall be verified, idempotent, and matched to an immutable payment intent/order.
- **PAY-005** EMT selection shall create AWAITING_EMT status and display approved instructions; only authorized billing staff may confirm receipt.
- **PAY-006** Matter creation and letter sending shall require PAYMENT_AUTHORIZED/PAID or EMT_CONFIRMED, according to policy configuration.
- **PAY-007** Refunds, reversals, chargebacks, and failed settlements shall create audit events and staff tasks; they shall not silently delete legal records.
- **PAY-008** The system shall store only provider token/reference, amount, currency, status, timestamps, and reconciliation metadata.

### 5.7 Letter generation and review

- **LTR-001** One separate letter shall be generated for each matter/agency.
- **LTR-002** The primary generation method shall be deterministic templates populated from verified structured fields.
- **LTR-003** AI may assist with optional narrative wording only through a constrained service; it shall not invent facts, citations, dates, account numbers, or legal conclusions.
- **LTR-004** AI input shall be minimized and redacted where possible; provider retention/training settings shall be contractually and technically restricted.
- **LTR-005** Every draft shall record template version, input snapshot, generator version, AI model/prompt version if used, rendered PDF hash, and author.
- **LTR-006** The lawyer review screen shall show source data, evidence links, warnings, document preview, diff from prior version, and approval controls.
- **LTR-007** Approval applies only to the exact content hash reviewed. Editing, regenerating, or replacing an attachment shall revert status to IN_REVIEW.
- **LTR-008** Only a lawyer-authorized role may approve and send a legal letter.
- **LTR-009** Rejected drafts shall require a reason and may be regenerated without overwriting prior versions.

### 5.8 Delivery and follow-up

- **DLV-001** Delivery channels shall be pluggable; MVP shall support email, with future postal/fax adapters.
- **DLV-002** The system shall use a verified firm sender domain and configurable reply-to address.
- **DLV-003** The client may be BCC'd only when policy and consent permit; full account numbers and sensitive attachments shall be minimized.
- **DLV-004** Outbound delivery shall include idempotency key, message ID, recipient, approved artifact hash, timestamp, provider status, and error details.
- **DLV-005** A sent copy and delivery metadata shall be uploaded/recorded in the corresponding Clio matter.
- **DLV-006** Bounces and failures shall create staff tasks; retries shall not send duplicates.
- **DLV-007** A configurable follow-up task shall be created after successful send.
- **DLV-008** The optional Phase 2 message shall be a configurable follow-up invitation, not an automated representation that the consumer has a valid claim.

### 5.9 Dashboards and administration

- **UI-001** Consumer dashboard shall show high-level status, requested actions, receipts, signed-retainer access, and sent-letter access where permitted.
- **UI-002** Staff dashboard shall filter by gate/status, age, assigned owner, payment state, identity state, conflict state, and delivery state.
- **UI-003** A master client view shall summarize contact, verification, retainer, invoice/payment, agency count, matters, letters, responses, and follow-ups.
- **UI-004** Each matter workspace shall isolate agency-specific data, evidence, letter versions, delivery, notes, and tasks.
- **UI-005** Administrators shall manage pricing, templates, custom-field mappings, allowed file types, retention, notification templates, and feature flags.
- **UI-006** Destructive or high-impact configuration changes shall require confirmation and an audit event.

## 6. Data Model

Use UUIDv7 or another sortable random identifier. Store timestamps in UTC. Use soft deletion plus retention workflows for legal records; do not cascade-delete audit history.

| Entity | Purpose |
|---|---|
| users | Staff identity, role, status, identity-provider subject. |
| clients | Consumer profile; encrypted DOB and selected sensitive fields. |
| intakes | Workflow aggregate, jurisdiction, state, submitted snapshot. |
| client_aliases | Prior/alternate names used for conflicts. |
| agencies | Normalized collection-agency organization/contact data. |
| debts | Original creditor, debt buyer, masked account reference, balance, dates. |
| matters | One row per intake-agency pair; local and Clio IDs; workflow state. |
| contact_events | Consumer-reported contact methods, dates, counts, allegations. |
| evidence_files | R2 key, category, matter links, quarantine/scan status, hash, metadata. |
| credit_reports | Sensitive document metadata and bureau/report date. |
| identity_verifications | Provider reference, status, checks, redacted results. |
| conflict_checks | Search package, reviewer, disposition, rationale, Clio query references. |
| retainer_versions | Immutable retainer template/version/content hash. |
| retainer_signatures | Signer evidence, provider envelope, signed artifact. |
| orders | Pricing snapshot, subtotal, tax, total, currency. |
| order_items | One line per agency/matter or configured fee item. |
| payments | Provider reference, method, status, amount, webhook state. |
| clio_connections | Encrypted OAuth token references and tenant metadata. |
| clio_mappings | Local entity ↔ Clio resource mapping and synchronization state. |
| letter_templates | Jurisdiction/versioned templates and publication state. |
| letter_versions | Matter draft, source snapshot, content/PDF hash, status. |
| approvals | Approver, exact letter hash, decision, timestamp, reason. |
| deliveries | Provider/message IDs, recipient, artifact hash, status, attempts. |
| tasks | Staff and follow-up tasks. |
| audit_events | Append-only security/legal/business events. |
| integration_jobs | Queue job, idempotency key, attempts, result/error. |

### 6.1 Data rules

- **DATA-001** Full account numbers shall not be stored unless approved as necessary; default storage is last four characters plus encrypted original document.
- **DATA-002** Sensitive columns shall use application-level envelope encryption with versioned keys.
- **DATA-003** Searchable normalized values and encrypted originals shall be separated; normalization shall not expose unnecessary PII.
- **DATA-004** Audit events shall be append-only and tamper-evident using chained hashes or an equivalent integrity mechanism.
- **DATA-005** Every external resource shall have a mapping record with provider, remote ID, local ID, last synchronized version, and idempotency key.
- **DATA-006** Database constraints shall enforce one active matter per intake-agency/debt combination unless an authorized duplicate override is recorded.

## 7. Cloudflare-Native Technical Architecture

| Layer | Recommended component | Responsibility |
|---|---|---|
| DNS/edge security | Cloudflare DNS, TLS, WAF, rate limiting, Bot/Turnstile | Protect public endpoints, abuse prevention, security headers. |
| Web application | Next.js on Cloudflare Workers via OpenNext | Public site, consumer portal, staff UI, server-rendered routes. |
| API/domain services | Cloudflare Workers service modules | Authorization, validation, workflow/state transitions, integration adapters. |
| Relational data | Cloudflare D1 for MVP | Workflow entities, configuration, mappings, audit metadata. Use migrations and transaction boundaries. |
| Object storage | Cloudflare R2 private buckets | Evidence, signed retainers, generated letters, delivery copies. |
| Asynchronous processing | Cloudflare Queues + consumers | Clio sync, webhooks, scanning, PDF generation, delivery, notifications, retries. |
| Coordination | Durable Objects only where needed | Single-flight locks/idempotency for a specific intake or delivery. |
| Staff access | Cloudflare Access | SSO/MFA protection for admin and review portal. |
| Secrets | Workers secrets and scoped API tokens | Clio, payment, ID, email, signing, and encryption key references. |
| Observability | Workers logs/metrics plus external SIEM/error tracker | Correlation IDs, alerts, audit and operational telemetry. |

**Portability requirement:** persistence, storage, queue, identity, payment, signature, Clio, PDF, email, and AI functions shall be accessed through typed adapters. This allows local mocks and future replacement without rewriting domain logic.

- **ARC-001** The repository shall be a TypeScript monorepo with strict mode, shared schemas, and separate web, worker/job, and package modules.
- **ARC-002** Domain logic shall not import provider SDKs directly; provider SDKs shall exist only in adapters.
- **ARC-003** All API inputs and integration payloads shall be runtime validated with a schema library.
- **ARC-004** Long-running or failure-prone operations shall be asynchronous; HTTP requests shall return a trackable operation status.
- **ARC-005** R2 buckets shall be private. Downloads shall use short-lived, authorization-checked signed URLs or streamed responses.
- **ARC-006** Public and staff routes shall be separated by hostname or path and by independent authorization middleware.
- **ARC-007** Production bindings and secrets shall be configured through Wrangler environments; no production secret may be committed.
- **ARC-008** Database migrations shall be forward-only in production, tested against a copy of schema, and reversible by compensating migration.
- **ARC-009** A provider outage shall degrade to a visible pending state rather than bypass a gate.
- **ARC-010** The application shall use correlation IDs across browser request, queue message, webhook, Clio call, payment call, and delivery.

## 8. API and Integration Contract Requirements

### 8.1 Representative internal endpoints

| Method/path | Purpose | Key control |
|---|---|---|
| POST /api/intakes | Create intake | Turnstile, rate limit, idempotency. |
| PATCH /api/intakes/:id | Save current step | Ownership, optimistic concurrency. |
| POST /api/intakes/:id/agencies | Add agency | Limit and schema validation. |
| POST /api/uploads/presign | Create upload URL | Ownership, type/size/quota policy. |
| POST /api/intakes/:id/submit | Freeze submission snapshot | Completeness and attestation. |
| POST /api/staff/conflicts/:id/disposition | Record human result | Privileged role and audit. |
| POST /api/identity/session | Create provider session | Eligible state and one-time token. |
| POST /api/webhooks/:provider | Receive signed webhook | Signature, replay, idempotency. |
| POST /api/retainers/:id/sign | Begin signature flow | Correct published version. |
| POST /api/orders/:id/payment | Create hosted payment | Server total and eligible state. |
| POST /api/staff/matters/:id/generate | Generate letter | All prerequisite gates. |
| POST /api/staff/letters/:id/approve | Approve exact version | Lawyer permission and hash. |
| POST /api/staff/letters/:id/send | Queue delivery | Valid approval bound to same hash. |

- **API-001** Mutating endpoints shall accept an Idempotency-Key and reject conflicting reuse.
- **API-002** Resources shall use ETags or version numbers for optimistic concurrency.
- **API-003** Errors shall use a consistent machine-readable envelope and shall not expose stack traces, tokens, or PII.
- **API-004** Webhooks shall acknowledge only after durable receipt; processing may continue asynchronously.
- **API-005** Integration adapters shall define timeout, retry, backoff, circuit-breaker, and dead-letter behavior.
- **API-006** Generated OpenAPI documentation shall be checked into the repository and validated in CI.

## 9. Security, Privacy, and Compliance Requirements

This specification defines technical safeguards, not legal conclusions. Applicable privacy, professional-responsibility, electronic-signature, payment, evidence-retention, consumer-protection, and cross-border data rules must be validated by qualified counsel for each operating jurisdiction.

- **SEC-001** TLS only; redirect HTTP; HSTS after validation; secure headers including CSP, frame-ancestors, nosniff, and strict referrer policy.
- **SEC-002** Cloudflare WAF managed rules, custom rate limits, Turnstile, and anomaly alerts on intake, login, upload, and webhook routes.
- **SEC-003** No sensitive response may be cached at the edge or browser; set Cache-Control: no-store on authenticated/PII routes.
- **SEC-004** CSRF protection on cookie-authenticated mutations; strict CORS allowlist; origin validation.
- **SEC-005** Parameterized queries/ORM protections, output encoding, and sanitization for rich text and filenames.
- **SEC-006** MFA for staff; short idle session; reauthentication for approval, sending, export, and manual overrides.
- **SEC-007** Envelope encryption for selected database fields and sensitive object classes; keys separated from ciphertext.
- **SEC-008** Secrets rotated, scoped, inventoried, and stored only in secret managers; logs redact Authorization, cookies, DOB, IDs, account numbers, and document contents.
- **SEC-009** Malware scanning and content validation before any uploaded file is opened or forwarded.
- **SEC-010** Signed URLs shall be single-purpose, short-lived, bound to object/action, and generated only after authorization.
- **SEC-011** Audit events shall cover authentication, reads of sensitive documents, exports, modifications, approvals, sends, overrides, and configuration changes.
- **SEC-012** Backups/export strategy shall be encrypted and tested; recovery objectives shall be documented and exercised.
- **SEC-013** Dependency, secret, static-analysis, and infrastructure scans shall run in CI; critical findings block release.
- **SEC-014** The system shall provide data access/export/correction/deletion workflows subject to legal hold and professional record obligations.
- **SEC-015** Retention shall be configurable by data class; expired data shall be deleted from primary storage, replicas, and provider systems where supported.
- **SEC-016** Third-party subprocessors shall be inventoried with data categories, purpose, region, retention, and contract status.
- **SEC-017** Staff views shall minimize PII by default; reveal/download actions require purpose and are logged.
- **SEC-018** Production administrative access shall use least privilege, named accounts, and no shared credentials.
- **SEC-019** Security incidents shall have severity, containment, evidence preservation, notification decision, and post-incident workflow.
- **SEC-020** AI prompts and outputs shall be treated as confidential legal-work-product data and excluded from model training where supported.

### 9.1 Threats that must be tested

- Unauthorized intake enumeration or cross-consumer access (IDOR).
- Upload of malware, polyglot files, oversized files, and MIME spoofing.
- Webhook forgery/replay and payment-status spoofing.
- Duplicate Clio matters, duplicate payments, and duplicate letter sends.
- Prompt injection embedded in uploaded evidence or credit reports.
- Approval bypass or changed-document-after-approval.
- PII leakage through logs, analytics, caches, URLs, email subject lines, or support tools.
- Staff privilege escalation and compromised service tokens.
- Conflict information exposed to the consumer or unauthorized staff.

## 10. Non-Functional Requirements

| Category | Requirement |
|---|---|
| Availability | Target 99.9% monthly for intake and staff portal, excluding third-party outages; queued work survives transient failures. |
| Performance | p95 public page response < 1.5 s at edge for non-upload operations; p95 API mutation < 800 ms excluding external calls. |
| Scalability | Support at least 10,000 active intakes and bursts of 50 submissions/minute without architectural change. |
| Accessibility | WCAG 2.2 AA target; keyboard operation, labels, focus, errors, contrast, and screen-reader testing. |
| Browser support | Current and previous major versions of Chrome, Edge, Firefox, and Safari; responsive mobile support. |
| Reliability | At-least-once queue delivery with idempotent consumers; dead-letter queue and replay tooling. |
| Maintainability | Strict TypeScript, linting, formatting, modular domain services, ADRs, generated API docs, and >80% domain test coverage target. |
| Privacy | Data minimization, explicit purpose, configurable retention, no sensitive analytics payloads. |
| Localization | Externalized copy, jurisdiction and currency configuration; English MVP with architecture ready for French. |
| Recovery | Document RPO ≤ 24 hours and RTO ≤ 8 hours for MVP; improve after production risk review. |

## 11. Local Development and Repository Requirements

### 11.1 Proposed repository

```
stopallcalls/
  apps/web                 Next.js public and staff UI
  workers/jobs             Queue consumers and scheduled jobs
  packages/domain          Entities, state machines, policies
  packages/db              D1 schema, migrations, repositories
  packages/contracts       Zod schemas and OpenAPI
  packages/integrations    Clio/payment/ID/sign/email/PDF/AI adapters
  packages/ui              Shared accessible components
  packages/testing         Fixtures, fake providers, contract tests
  infra                    Wrangler config, Cloudflare resources, runbooks
  docs                     ADRs, threat model, data map, operations
```

- **DEV-001** The project shall run locally with Node.js LTS, pnpm, Wrangler, and local D1/R2/Queue emulation.
- **DEV-002** A single documented command shall install dependencies, create local bindings, run migrations, seed sample data, and start the app.
- **DEV-003** All third-party providers shall have deterministic fake adapters; local development shall not require real Clio, payment, ID, or email credentials.
- **DEV-004** Seed data shall be fictitious and clearly marked; no production PII may be used in tests.
- **DEV-005** Environment validation shall fail fast with actionable errors.
- **DEV-006** The repository shall include .env.example without secrets, wrangler environment templates, and setup instructions.
- **DEV-007** Claude/Cursor instructions shall prohibit bypassing gates, weakening tests, or committing secrets to make a test pass.

### 11.2 Suggested commands

```
pnpm install
pnpm dev:setup
pnpm db:migrate:local
pnpm db:seed
pnpm dev
pnpm test
pnpm test:e2e
pnpm lint
pnpm typecheck
pnpm cf:deploy:preview
```

## 12. Testing and Quality Gates

- **TST-001** Unit tests shall cover pricing, gate evaluation, state transitions, authorization policies, redaction, and idempotency.
- **TST-002** Integration tests shall use local D1/R2/Queues and fake provider adapters.
- **TST-003** Contract tests shall validate Clio, payment, identity, signature, and delivery request/response mappings against recorded non-sensitive fixtures.
- **TST-004** End-to-end tests shall cover one agency, multiple agencies, possible conflict, identity mismatch, failed payment, EMT, changed-after-approval, bounce, and retry.
- **TST-005** Security tests shall include authorization matrix, IDOR, CSRF, XSS, upload attacks, webhook replay, rate limits, and sensitive-log scanning.
- **TST-006** Accessibility automation and manual keyboard/screen-reader checks shall gate major releases.
- **TST-007** No deployment shall proceed with failing type checks, tests, migrations, secret scan, or critical/high dependency vulnerabilities without documented exception.
- **TST-008** Preview deployments shall use isolated data and provider sandboxes.

### 12.1 Mandatory acceptance scenarios

| Scenario | Expected result |
|---|---|
| Happy path—one agency | Consumer completes all gates; one contact and one matter are created; approved letter sent exactly once. |
| Happy path—three agencies | One contact, three matters, three invoices/items as configured, three independent approvals and sends. |
| Possible conflict | No identity/payment/matter continuation until human disposition; consumer sees neutral pending message. |
| Identity mismatch | Manual review; no automatic rejection or bypass. |
| No evidence | Submission may be saved, but letter cannot be approved without qualifying evidence or lawyer override. |
| Card webhook replay | Payment state changes once; duplicate webhook is harmless. |
| Clio timeout mid-batch | Successful resources are mapped; retry creates only missing matters. |
| Letter edited after approval | Approval invalidated; send endpoint refuses. |
| Send retry | Provider timeout does not produce duplicate message; final status reconciled by message ID. |
| Malicious upload | File remains quarantined and cannot be downloaded or attached. |

## 13. Deployment, Operations, and Observability

- **OPS-001** Use separate Cloudflare accounts/projects or strongly isolated environments for development, preview, staging, and production.
- **OPS-002** Deploy through CI with pinned dependencies, migration step, smoke tests, and manual production approval.
- **OPS-003** Use canary or gradual Worker deployment where available; retain rollback artifacts.
- **OPS-004** Dashboards shall show request errors, queue depth, dead letters, provider latency/errors, Clio sync lag, payment anomalies, and delivery failures.
- **OPS-005** Alerts shall be actionable and route by severity; alerts must not include PII.
- **OPS-006** Runbooks shall cover Clio outage, payment outage, identity outage, email outage, compromised credential, suspicious upload, duplicate send, and data request.
- **OPS-007** Scheduled reconciliation shall compare pending local integrations with Clio/payment/delivery provider states.
- **OPS-008** Production changes to templates, pricing, and mappings shall be versioned and auditable.

## 14. Phased Build Plan

| Phase | Deliverables | Exit criterion |
|---|---|---|
| 0 — Foundation | Monorepo, Cloudflare environments, D1/R2/Queues, auth skeleton, CI, threat model, fake providers. | Local setup succeeds from clean clone; preview deployment passes. |
| 1 — Intake MVP | Landing page, consumer auth/session, multi-step intake, multiple agencies, save/resume, submission snapshot. | E2E intake tests pass on mobile and desktop. |
| 2 — Evidence | Direct uploads, quarantine, scanning integration, evidence review, chain of custody. | Malicious/invalid uploads blocked; clean evidence reviewable. |
| 3 — Conflict + Clio | OAuth, search package, human disposition, contact mapping, one matter per agency. | Retry tests prove no duplicate contacts/matters. |
| 4 — Identity/Retainer/Payment | Provider adapters, signature, pricing/order, hosted payment, EMT workflow. | All gates enforced and webhook replay tests pass. |
| 5 — Letters | Template engine, PDF, lawyer review/diff, hash-bound approval, delivery and Clio upload. | No send without exact valid approval; send exactly once. |
| 6 — Operations | Dashboards, follow-up, audit export, retention, observability, runbooks, security review. | Production readiness checklist signed off. |
| 7 — Optional intelligence | Reviewed OCR extraction and constrained AI drafting. | Accuracy benchmark, human confirmation, privacy/security approval. |

## 15. Implementation Instructions for Claude Code / Cursor

The coding agent shall follow these constraints:

- Implement vertical slices in the phase order above; do not scaffold unused "future" complexity.
- Before changing architecture, write or update an Architecture Decision Record.
- Treat workflow gates and authorization policies as domain code with tests, not UI conditions.
- Never call Clio, payment, identity, email, signature, AI, or PDF providers directly from React components.
- Use fake adapters by default locally and provider sandbox adapters only through explicit configuration.
- Generate migrations; never mutate production schema manually.
- Do not log request bodies on sensitive routes.
- Do not place PII, account numbers, access tokens, intake IDs, or signed URLs in URLs or analytics events.
- Do not use AI output as a legal decision or send it without lawyer review.
- When uncertain about a legal policy, create a configuration/policy placeholder and record the open decision instead of inventing a rule.
- Each pull request must state security/privacy impact, migrations, new secrets, provider effects, tests, and rollback.

### 15.1 Definition of done for every feature

- Requirements and acceptance criteria implemented.
- Authorization and negative tests included.
- Audit events included for sensitive actions.
- Provider calls idempotent and failure-tested.
- PII/logging/caching reviewed.
- Accessibility verified.
- Documentation and runbook updated.
- No critical or high unresolved security findings.

## 16. Configuration and Open Decisions

| Decision | Recommended default | Must be confirmed before production |
|---|---|---|
| Operating jurisdiction | Configurable country/province/state | Licensed-service boundaries and required wording. |
| Evidence rule | At least one proof item; attestation only with lawyer override | Firm policy and jurisdictional requirements. |
| Payment timing | Before matter creation and send | Trust/general-account handling and fee agreement. |
| Identity retention | Provider-hosted; retain result only | Required evidence and retention period. |
| Credit report retention | Private R2 with limited staff access | Necessity and deletion schedule. |
| Client BCC | Configurable, off until approved | Confidentiality and disclosure policy. |
| Phase 2 email | Neutral invitation after delivery | Marketing/solicitation and consent rules. |
| Clio conflict API behavior | Search through supported API resources and require human review | Exact tenant/API capabilities and workflow. |
| Database region | Closest compliant Cloudflare location controls available | Residency and cross-border requirements. |
| AI provider | Disabled in initial MVP | Privacy terms, data residency, retention, professional obligations. |

## 17. MVP Release Acceptance

The MVP is releasable only when all statements below are true:

- A clean local clone runs using fake providers and sample data.
- Public intake is protected against abuse and unauthorized data access.
- One intake can create multiple independent agency matters without duplicates.
- Conflict, identity, evidence, retainer, payment, and approval gates cannot be bypassed through API calls.
- Every sent letter was approved by an authorized lawyer against the same immutable hash.
- Evidence and legal documents are private, scanned, encrypted as required, and access logged.
- Clio failures, webhook replays, and delivery timeouts recover without duplicate side effects.
- Security, privacy, accessibility, backup/recovery, and operational runbooks are reviewed.
- All jurisdictional text, fee handling, retainer language, retention, and delivery policy are approved by qualified counsel.

## Appendix A — Primary Technical References

| Reference | URL |
|---|---|
| Cloudflare Workers: Next.js guide | https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/ |
| Cloudflare Developer Platform documentation | https://developers.cloudflare.com/ |
| Cloudflare Turnstile with Workers | https://developers.cloudflare.com/workers/examples/turnstile-html-rewriter/ |
| Cloudflare One / Zero Trust overview | https://developers.cloudflare.com/cloudflare-one/ |
| Cloudflare Workers environment variables and secrets | https://developers.cloudflare.com/workers/configuration/environment-variables/ |
| Cloudflare API token permissions | https://developers.cloudflare.com/fundamentals/api/reference/permissions/ |
| Clio Manage API v4 reference | https://docs.developers.clio.com/clio-manage/api-reference/ |
| Clio API authorization (OAuth 2.0) | https://docs.developers.clio.com/api-docs/clio-manage/authorization/ |
| Clio Manage integration guide | https://docs.developers.clio.com/guides/clio-manage/ |
| Clio conflict checks help article | https://help.clio.com/hc/en-us/articles/41182681954331-Conflict-Checks-in-Clio-Manage-and-Clio-Grow |

References were reviewed on July 10, 2026. Vendor capabilities and pricing must be revalidated during implementation.

## Appendix B — Glossary

| Term | Definition |
|---|---|
| Agency | Collection agency, debt collector, or recovery organization represented by one independent matter. |
| Client | Consumer requesting the limited-scope service. |
| Gate | A mandatory condition that must pass before a workflow transition. |
| Matter | The application record and corresponding Clio matter for one client-agency relationship. |
| Evidence | Uploaded proof, credit report, or approved attestation supporting reported collection contact. |
| Idempotency | Property that makes repeated processing produce one intended external side effect. |
| Letter hash | Cryptographic digest binding approval to the exact letter content/artifact. |
| System of record | The authoritative official location for legal practice records; Clio in this design. |
