# Mera PRF issuer boundary

Mera PRF is intentionally optional for the submission-critical path. Runtime
Passport already accepts an issuer identity and signs with Ed25519; a future
WebAuthn/PRF adapter can implement that issuer boundary without changing
Passport verification or registry provenance.

No fake PRF implementation is included. This keeps the trust claim honest and
avoids turning Crucible into a wallet application.
