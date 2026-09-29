# CrewCheck TV 0.1.6 — automatic channel and original soundtrack

User requested changing screens automatically and supplied four original MP3 attachments. This slice consumes existing snapshots only; no parser/APZ, auth, server, Render, main branch, privacy or store changes. Based on #705 with receive-time fix intact.

## Behavior

Auto screens default ON, 30 seconds per screen; 20/30/45/60 seconds selectable. Cycle Agora, Semana, Mês, plus Mudanças/Notícias only with content. Remote/pointer use pauses for a one-minute reading window before restarting the screen interval. Settings/day/pairing/exit/hidden app/screen-care cover hold rotation. Exibir canal agora resumes explicitly. Replaces the unconditional legacy return-to-Agora every second after 120 seconds, which conflicts with rotation. Automatic updates never manufacture input or reset screen-care inactivity.

One HTML audio element across view changes, sequential looping playlist: CrewCheck Theme, CrewCheck Suite, Clear for Flight, Effortless Ascent. Music starts only after an explicit user action, initially at 15% app volume. Play/pause, previous/next, direct track choice and volume. Track/volume persist, autoplay permission/playing intent does not persist across cold starts. Audio pauses when hidden, under screen care, in the exit dialog, and stops on loss of snapshot/account. Resume from cover/hidden only if explicitly playing before; failed play permission yields a button instead of bypassing browser policy. Short fade-in, no two-element crossfade. Missing/failed assets stop after a bounded playlist attempt; roster stays usable.

## Original assets and packaging

Four files are MP3, 44.1 kHz stereo, approximately 120 seconds each. Container media probes decoded every file without error; waveform identity hashes differ. Originals are preserved without transcoding and without upload to a public music host/repository. music-manifest.json stores expected names/hashes only.

CI stages executable client JS/CSS but labels its artifact UNFINALIZED. It includes official webOS CLI 3.2.6 to finalize with the owner-supplied files locally. Do not install or submit the unfinalized artifact as a complete music build. From an extracted artifact preserving folders:

    node scripts/tv-channel-attach-music.mjs dist/channel/pilot /path/to/original/mp3s
    ares-package --no-minify dist/channel/pilot --outdir output

The same can finalize the demo directory. Hash verification fails closed before copying if any original is absent or changed. These demo/pilot identities are not store release IDs. Real-account pilot still needs owner authorization on the existing preview; no live pairing success claimed.

## Tests and limits

Policy and audio-controller tests use fake audio ports (intent, suspend, autoplay denial, bounded failures, loop, late responses, volume, logout). Typecheck/build and packaged-browser tests are separate. Successful desktop playback does not establish audible output, volume response, decoder lifecycle or suspension on LG 55SM9000PSA. The user must test hardware. Auto rotation/music is not burn-in prevention and does not disable LG native protections.

Official references consulted 2026-09-18:
- https://webostv.developer.lge.com/develop/guides/multi-sound-playback — one audio element for background music, pause on suspension, MP3 MIME support.
- https://developer.chrome.com/blog/play-returns-promise — handle fulfilled/rejected/undefined play result without bypassing user gesture.

DRAFT / NO MERGE. #530/#607 remain. No background task, public release, Render change or production enablement performed by this feature.
