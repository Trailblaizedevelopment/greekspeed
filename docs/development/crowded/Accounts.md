# Crowded Accounts

## Purpose

This document scopes the core Crowded account concepts that matter to Trailblaize as we continue the integration. It is intentionally product-focused first, with implementation notes added only where they materially affect our app design.

Use this as the starting point for account terminology, permissions, lifecycle, and integration assumptions before diving into API details.

## Sources

- Crowded support: [Opening an account](https://support.bankingcrowded.com/hc/en-us/articles/20933300582033-Opening-an-account)
- Crowded support: [Managing Sub Accounts](https://support.bankingcrowded.com/hc/en-us/articles/29846206020625-Managing-Sub-Accounts)
- Crowded support: [Closing an Account](https://support.bankingcrowded.com/hc/en-us/articles/28470996079889-Closing-an-Account)
- Crowded support: [What are Per Diem Accounts?](https://support.bankingcrowded.com/hc/en-us/articles/21300689184401-What-are-Per-Diem-Accounts)
- Internal technical reference: `docs/development/features/crowded_cursor_postman_session.md`

---

## Core Concepts

### Organization account

Crowded is organized around an organization-level account. Account setup starts with the organization, not the individual user.

Support guidance indicates that opening an account includes:

- creating an account with email or Google
- verifying email and phone number
- providing organization details such as legal name and EIN
- completing bank account setup
- funding the account or creating a first collection

Important operational notes:

- the user completing setup must be at least `18`
- Crowded treats the organization account as the primary banking relationship
- Trailblaize should treat the organization or chapter-level Crowded account as the main integration anchor

### Sub Accounts

Sub Accounts are child accounts managed under a primary Crowded account.

Confirmed support behavior:

- Sub Account admins cannot see the HQ account
- Sub Account admins cannot access other Sub Accounts unless separately invited
- HQ admins can add themselves as admins on a Sub Account
- HQ can transfer funds from the primary checking balance into a Sub Account
- external ACH transfers into a specific Sub Account are supported
- each Sub Account has its own account number, while sharing the HQ routing number and account name

Practical implication for Trailblaize:

- Sub Accounts are a strong fit when one parent organization needs fund separation across internal groups, programs, or chapters
- permissions are intentionally isolated, so our UI and docs should never imply that all admins can see all account activity

### Per Diem Accounts

Per Diem Accounts are organization-issued accounts intended for a specific individual to use at their discretion.

Confirmed support behavior:

- the assigned user accesses funds through Crowded's mobile experience
- the assigned user must already be registered as a contact of the organization
- login is phone-number based
- users can spend from the account and check balance
- check deposit is not supported

Practical implication for Trailblaize:

- Per Diem Accounts appear best suited for delegated spending, travel, event operations, or temporary budget access
- these should be treated differently from a chapter treasury account or parent operating account

---

## Roles And Permissions

Crowded's account model includes several distinct authority levels that matter for product and documentation work.

### Account owner

- the only role authorized to close a Crowded account
- should be treated as the highest legal or banking authority in the account lifecycle

### HQ admin

- manages the primary organization account
- can manage Sub Accounts
- can fund Sub Accounts
- can add themselves to a Sub Account if they need direct visibility into its activity

### Sub Account admin

- can access only the specific Sub Account they were invited to
- cannot see HQ balances or transactions by default
- cannot access sibling Sub Accounts by default

### Contact

- a user must be a Crowded contact before certain user-level flows, such as Per Diem access, can work
- this role is not the same thing as an HQ admin, Sub Account admin, or account owner

Implication for Trailblaize:

- we should keep Crowded authority separate from Trailblaize app roles such as `exec admin`, `member`, or chapter-level permissions
- not every Trailblaize admin should be assumed to have equivalent Crowded banking authority

---

## Account Lifecycle

### 1. Open

At a high level:

1. A user signs up in Crowded on behalf of an organization.
2. The organization and user identity are verified.
3. The organization completes banking setup.
4. The account is funded or used for collections.

Open questions for our implementation:

- who within a chapter or organization should be expected to complete Crowded onboarding
- whether Trailblaize should only support already-provisioned Crowded accounts or eventually help guide setup

### 2. Operate

After setup, the organization can:

- manage the main account
- create or manage Sub Accounts
- transfer funds internally
- issue Per Diem Accounts where applicable
- use collections and payment flows tied to contacts

### 3. Close

Support guidance for closure is strict:

- the account must have a `0` balance
- only the account owner can close it
- Crowded currently handles closure via an explicit closure request flow

Implication for Trailblaize:

- account closure should be treated as an operational or support-managed process, not a normal in-app self-service action unless Crowded later exposes a safe supported API path for it

---

## Trailblaize Mapping

This is the current working model for how Crowded account concepts relate to Trailblaize.

| Crowded concept | Trailblaize interpretation |
|---|---|
| Organization account | Primary external banking relationship for a chapter or parent organization |
| Sub Account | Isolated account under a parent organization, potentially useful for chapter, program, or fund separation |
| Per Diem Account | Individual-use delegated spending account tied to a contact |
| Contact | Person record required for certain Crowded user-facing flows |
| Account owner | Legal or banking authority, not just an in-app admin |

Important terminology rule:

- avoid using the generic word `account` in product or engineering docs when a more specific term is available
- prefer `organization account`, `Sub Account`, or `Per Diem Account`

---

## Confirmed Integration Notes

The internal Crowded integration doc already confirms some implementation details relevant to accounts.

### Accounts API

Confirmed in our sandbox work:

- list accounts endpoint: `GET /api/v1/chapters/:chapterId/accounts`
- account list responses may contain nested `data.data`
- account ids may be opaque string values rather than UUIDs
- `crowded_account_id` is treated as `TEXT` in our database

### Current account sync behavior

Our existing integration work indicates:

- account sync should rely on the accounts list endpoint
- single-account fetch behavior may be inconsistent in sandbox
- account numbers and routing numbers should be treated as sensitive data

### Bulk account creation

Our internal testing confirmed:

- bulk create uses `POST /api/v1/chapters/:chapterId/accounts`
- supported create products are currently `wallet` and `perdiem`
- `checking` appears in list responses but is not a valid value for bulk create

Practical implication:

- documentation and product assumptions should distinguish between account products Crowded exposes for listing versus products Crowded allows us to create directly

---

## Documentation Guidance

As we expand Crowded docs in this repo, this page should remain the high-level reference for account concepts.

Recommended follow-up docs:

- `Contacts.md`
- `Collections.md`
- `Webhooks.md`
- `Treasurer Workflows.md`
- `Glossary.md`

Suggested usage:

- keep this file focused on concepts, permissions, and lifecycle
- keep endpoint details and response shapes in technical integration docs
- add product decisions here when Trailblaize chooses how to expose Crowded account features in-app

---

## Open Questions

These should be resolved as the integration matures:

- Which Crowded account type should represent a chapter's primary operating balance in Trailblaize?
- When should we create or sync Sub Accounts versus Per Diem Accounts?
- Which Trailblaize roles are allowed to initiate Crowded account actions?
- Which Crowded actions should remain support-driven rather than self-service in our product?
- What account metadata should we sync into Trailblaize versus display directly from Crowded?

---

## Related Docs

- `docs/development/features/crowded_cursor_postman_session.md`
