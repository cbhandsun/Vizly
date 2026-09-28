# Security Policy

## Supported versions

Security fixes are handled on `main` before public release. Unreleased local
tarball integrations are not production support commitments.

## Reporting

Report suspected vulnerabilities privately to the repository owner. Do not open
public issues containing secrets, tokens, private URLs, credentials, customer
content, or exploit details.

## Handling sensitive data

- Do not commit `.env`, `.npmrc`, auth headers, cookies, API keys, or generated
  credential caches.
- Test fixtures should use canary values rather than realistic secrets.
- Logs and audit artifacts must redact provider keys, bearer tokens, cookies,
  and user-authored content.

