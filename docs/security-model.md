# Vizly browser security model

## Content execution boundary

The static application shell ships a Content Security Policy that permits
scripts only from the same origin, blocks objects and frames, and does not
enable `unsafe-eval`. Runtime styles remain allowed inline because Ant Design
and diagram rendering use CSS-in-JS. Provider, storage, image, and WebSocket
connections remain protocol-scoped because users can configure remote
services.

Production hosts should also send the same policy as an HTTP response header.
The HTML meta policy is the portable baseline; response headers are still
required for directives such as `frame-ancestors` and for
`X-Content-Type-Options`.

## Cloud-synced AI provider secrets

AI provider keys are encrypted before cloud synchronization with AES-GCM and a
random, per-user browser secret. The local secret is validated as 32 bytes of
base64 key material, malformed storage values are replaced, and user
identifiers are bounded before they enter storage or key derivation.

This is envelope protection for cloud ciphertext and accidental disclosure. It
is not a defense against active same-origin script execution: successful XSS
can read browser storage or call the decrypt path while the application is
running. The CSP, HTML sanitizers, DOM-sink gate, dependency review, and short
provider-token lifetimes are therefore part of the same security boundary.

For stronger protection against a compromised browser origin, use a
server-side secret vault or a user-supplied passphrase that is never persisted
by the application.
