# Local CHT text import

Base: main 26c3a96e7dc4c40278fd194a6e66a9dc025ec6e3.

The existing account-bound encrypted vault now reads digital CHT text locally with the installed PDF.js dependency. Explicit rating/medical/language expiry sections produce editable records. Day and month precision remain distinct. Issue dates do not renew expiry. Portuguese proficiency without an expiry produces no expiry record. Translations deduplicate, differing dates remain pending, and existing manual/history entries are retained.

The default repeat import preserves the previous copy when its expiry records match. A visible separate-copy action allows retaining a different file; it does not replace or silently discard the original. Extraction is not ANAC/source/signature validation or medical fitness assessment. No holder identity is extracted.

Preview renders canvas or supported image bytes inside the vault. Download reuses the existing blob download helper. External navigation rules are unchanged. Account/session changes discard unlocked state, pending extraction and previews. No external OCR, uploads, messages, permission requests or provider activation.

Scope: textual CHT model only. Image OCR and complete RG/passport/CNH classification are not implemented. Existing manual import remains available. The icon/editor action layout narrowly reuses the intent of PR #975 without importing its old branch or unrelated changes.

Synthetic regression coverage: exact two-page table structure, four distinct records, Portuguese/English medical deduplication, invalid/conflicting dates, issue-date change, manual history, encrypted reload, local preview/download, account isolation and mobile layout. No personal documents belong in repository fixtures or artifacts.
