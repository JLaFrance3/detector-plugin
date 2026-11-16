# C2PA test images

Used by `e2e/spike-c2pa.mjs` and the C2PA reader tests. Do not re-save or optimize these files: any byte change breaks the hash binding.

| File | Source | Expected result |
| --- | --- | --- |
| `adobe-20220124-A.jpg` | c2pa-org/public-testfiles `legacy/1.4/image/jpeg` | No manifest |
| `adobe-20220124-C.jpg` | same | Valid manifest, test certificate, so **not trusted** |
| `adobe-20220124-CA.jpg` | same | Valid manifest with an ingredient, **not trusted** |
| `adobe-20220124-E-dat-CA.jpg` | same | **Invalid**: image data changed after signing (`assertion.dataHash.mismatch`) |
| `adobe-20220124-E-sig-CA.jpg` | same | **Invalid**: claim signature tampered (`claimSignature.mismatch`) |
| `adobe-photoshop-ai-edited-trusted.jpg` | contentauth/c2pa-rs `sdk/tests/fixtures/ocsp.jpg` | **Trusted** (Adobe C2PA, Photoshop 26.9.0), source type `compositeWithTrainedAlgorithmicMedia` (AI-edited) |
| `adobe-trusted-no-ai-source.jpg` | contentauth/c2pa-rs `sdk/src/identity/tests/fixtures/claim_aggregation/adobe_connected_identities.jpg` | **Trusted** (Adobe C2PA Stage), no AI source type |
| `adobe-remote-manifest.jpg` | contentauth/c2pa-rs `sdk/tests/fixtures/cloud.jpg` | Manifest is stored remotely; the extension never fetches it, so it is treated as no manifest |

The public test files are licensed CC BY-SA 4.0 (c2pa-org/public-testfiles); the c2pa-rs fixtures are MIT/Apache-2.0.
