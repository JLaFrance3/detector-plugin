# Bundled C2PA trust lists

Downloaded 2026-11-15. They are bundled so that validation never touches the network (REQ-PRV-001, REQ-SEC-008). Refresh them before submission.

| File | Source |
| --- | --- |
| `C2PA-TRUST-LIST.pem` | https://github.com/c2pa-org/conformance-public/blob/main/trust-list/C2PA-TRUST-LIST.pem (official C2PA trust list) |
| `C2PA-TSA-TRUST-LIST.pem` | https://github.com/c2pa-org/conformance-public/blob/main/trust-list/C2PA-TSA-TRUST-LIST.pem (time-stamp authorities) |
| `anchors.pem` | https://contentcredentials.org/trust/anchors.pem (interim list used before the official one; frozen) |
| `store.cfg` | https://contentcredentials.org/trust/store.cfg (allowed extended key usages) |
