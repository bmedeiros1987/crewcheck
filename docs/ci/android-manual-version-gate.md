# Android manual version gate

The Android release workflow validates `client/public/manual.html` against the canonical release version exported as `CREWCHECK_VERSION`.

When the canonical release changes, the manual marker must be updated in the same release preparation path or the Android release gate will fail before Gradle build/signing.

Current release aligned in this hotfix: `14.3.73`.
