# Privacy and Consent

## Principles

Data minimisation; granular, revocable consent; server-side enforcement; transparency; and no surprises.

## What is collected

| Data | Why | Protection |
|---|---|---|
| Email, password hash | Sign-in | bcrypt (cost 11); email is unique |
| Preferred name, optional age band | Personalisation, fairness monitoring | No date of birth, nationality or location collected |
| Conversations (optional) | Continuity for the user | AES-256-GCM encrypted. History can be switched off (ephemeral, purged within 24 h) |
| Personal memory (optional) | Companion context | Explicit per-item saves only; encrypted; deleted when memory is turned off |
| Check-ins, WHO-5 answers, goals | Wellbeing tracking | Check-in notes encrypted |
| Physical-health context (optional) | Shared with clinicians only if chosen | Encrypted |
| Trusted contacts | Personal support | Phone and email encrypted |
| Consents, referrals, summaries, safety plan | Care workflow | Summaries, referral reasons and safety plans encrypted |
| Safety events | Safety workflow and monitoring | Level, category codes and timestamps only; **no message text** |
| Audit logs | Accountability | Who did what to which record; **no content** |

Conversation titles are date-based and never derived from message text. Application logs record error codes, never request bodies or content. Prisma query logging is disabled.

## Consent model

`ConsentRecord` is an **append-only ledger**. Revoking sets `revokedAt` and rows are never rewritten. Each record has a scope, grantee, data categories and policy version.

| Scope | Granted when | Revocation effect (immediate, enforced on the server) |
|---|---|---|
| `AI_PROCESSING` | Onboarding (required for the companion) | Account deletion |
| `WELLBEING_MEMORY` | Memory turned on | Memory turned off, all memories deleted |
| `SHARE_SUMMARY_WITH_CLINICIAN` | Patient previews and confirms a summary for one clinician | Clinician loses all access; shared summaries revoked |
| `TRUSTED_CONTACT_SHARING` | Contact added or edited with categories | Subsequent sharing with that contact is blocked; blocked attempts are recorded |
| `AGGREGATE_ANALYTICS` | Optional in onboarding | Excluded from wellbeing aggregates |

**Clinician sharing** follows preview, explicit confirmation, then an encrypted snapshot. A new share supersedes earlier snapshots, so information the patient later excludes does not remain visible. Private conversations are never included.

**Trusted contacts** only receive messages the patient chooses to send, in permitted categories, with a preview first. Scores, check-ins and conversations are never sent. In the prototype every message is **simulated** and never delivered.

**Employers:** SaveTheSoul has no employer role, integration or data path.

## Patient controls

Profile & Privacy shows:
- toggles for history and memory;
- individual memory deletion;
- delete-all-conversations;
- the full consent ledger with revoke buttons;
- a **"Who accessed my information"** log of clinician access, including denied attempts;
- a JSON export of all stored data, decrypted;
- permanent account deletion (cascade). Audit entries retain only an opaque subject id.

## Security controls

- TLS in transit (Railway edge), HSTS, `X-Frame-Options: DENY`, `nosniff`, a strict referrer policy and a restrictive permissions policy.
- Session token: 256-bit random value. Only its SHA-256 hash is stored. Cookie is httpOnly, Secure (in production) and SameSite=Lax, with a 12-hour expiry and server-side revocation on sign-out.
- CSRF defence in depth: state-changing requests with a foreign `Origin` are rejected.
- Rate limits on sign-in, registration, chat and telemetry.
- Secrets live only in environment variables. The LLM key is used only on the server.
- The service worker caches only public, non-personal pages.

**Key management:** `DATA_ENCRYPTION_KEY` (32 bytes) encrypts sensitive fields. Ciphertext is versioned (`v1:`) to allow rotation. A production deployment should hold the key in a managed KMS or HSM and support re-encryption. Losing the key makes encrypted fields unrecoverable.

## Retention (prototype policy)

- Data is kept until the user deletes it or the account.
- Ephemeral conversations (history off) are purged after 24 hours or when the next conversation starts.
- Sessions expire after 12 hours.
- Audit logs are kept for accountability, with no content.

A production policy must be set with clinical governance and legal counsel.

## UAE and Abu Dhabi compliance considerations (future deployment)

SaveTheSoul **does not claim compliance** with any of the following. These are the requirements a production deployment would need to assess with qualified legal and regulatory advice:

- **Federal Law No. 2 of 2019** on the use of ICT in health fields, and its implementing regulations, including **health-data localisation** (storage and processing inside the UAE unless an exception applies) and retention obligations.
- **Federal Decree-Law No. 45 of 2021** on personal data protection (PDPL): lawful basis, data-subject rights, sensitive data. Note how health data is treated under its scope.
- **Department of Health – Abu Dhabi** standards, including the Abu Dhabi Healthcare Information and Cyber Security Standard (ADHICS), DoH policies on telemedicine and digital health, and AI-in-healthcare guidance; licensing of any clinical service; and integration with **Malaffi** if exchanging records.
- Hosting in a UAE region, data processing agreements with any LLM provider (including whether data leaves the UAE), and medical-device classification of any feature that could be considered clinical decision support.
- Mental-health-specific legal provisions (for example Federal Law No. 10 of 2023 on Mental Health) that govern emergency intervention and disclosure.

The current Railway deployment and external LLM API are **suitable only for synthetic demonstration data**.

## AI processing disclosure

Shown to users in onboarding and at `/privacy-notice`:
- messages are sent from the server to an AI model provider to generate replies;
- a separate safety check runs first;
- an AI may draft a clinician summary from the structured data the patient approved, never from conversations, and it is labelled unverified until reviewed.
