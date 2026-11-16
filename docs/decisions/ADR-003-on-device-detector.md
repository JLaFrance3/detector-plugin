# ADR-003: On-device detector by default, cloud only on click

- **Status:** Accepted, 2026-11-04
- **Requirements:** REQ-F-006, REQ-F-009, REQ-PRV-001, REQ-PRV-002

## Context
Sending every image a user views to a cloud API leaks their browsing. Anonymizing the request hides who is asking but not what: the image is the data. An MIT-licensed ViT classifier, `onnx-community/CommunityForensics-DeepfakeDet-ViT-ONNX` (trained on 2.7M images from 4,803 generators), runs in the browser with transformers.js. Its authors report 97.2% accuracy and a 2.1% false positive rate on their own, unverified tests.

## Decision
Run detection on-device for every visible image. Offer a cloud second opinion (Sightengine via our backend) only when the user clicks a button for one image. No custom model is trained.

## Consequences
- Strong privacy story and no per-image cost.
- First use downloads the model; size and speed must be confirmed in a spike.
- Accuracy on new generators and recompressed images will be lower than reported; the threshold must be calibrated (REQ-NF-006).
- Using AI on-device in the page is the main "innovative" element for grading.
