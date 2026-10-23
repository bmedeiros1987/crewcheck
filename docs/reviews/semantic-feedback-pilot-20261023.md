# Semantic feedback pilot

Base: `6269b5100a5db25fbcd90696747cd95829221795`. Separate branch `feat/semantic-feedback-pilot-20261023`; PR #1204 remains at `bd3d4a049bf99079114318735fc2d2726685c7c9`.

Existing Button gains optional `feedback="action|neutral|success|danger|pending"`. Existing Card accepts `data-crew-feedback="pending"`; no duplicate Card component. Card-only consumers must import `@/components/ui/semantic-feedback.css`. Button imports that sheet. No production caller opts in yet: adoption needs a separate owner-coordinated change. Omitting the attribute preserves existing appearance and geometry.

Aliases reuse current theme semantics. Action is blue/cyan, success green, conflict red, pending neutral; labels/icons convey state independently of color. No amber, new dependency, engine or confirmation change. Light action alias is deepened to #05679f for white text contrast 6.09:1; existing primary stays unchanged. Focus is immediate with 3px outline and 3px offset. Enabled press moves 1px, disclosure chevron turns, and color/border transitions take 150ms. Reduced motion removes transitions/transforms. No continuous animation or height animation.

## Ownership

Revalidated main and actual filenames of all 85 open PRs before publishing: no overlap with index.css, ui/button.tsx, ui/card.tsx or semantic-feedback.css. #1203 is actively changing client Home and CrewCierge modules; all excluded here. main.tsx (#1085/#999), footer (#919), Radar (#1198), finance (#1200), security/dependencies (#1201), preparation scripts and #1204 cards are untouched. Card.tsx itself is unchanged. Repeat this check before later adoption/merge.

## Validation

`npm run check` and `npm run build` passed using offline installed dependencies and the repository canonical preparation. Generated preparation changes were removed from the patch after validation.

`MENU_PLAYWRIGHT_PACKAGE=/path/to/playwright/package.json node scripts/regression-semantic-feedback-browser.mjs` passed 24 contexts: 320/390/1440px, light/dark, actual Settings text preference 100/200%, motion/reduced motion. The fixture imports real Button/Card, theme and TextSizeSetting plus compiled production CSS. It blocks external requests and uses only synthetic data. No production route, Home integration or physical-device claim.

Assertions cover text contrast >=4.5:1 (measured minimum 4.55), control boundary >=3:1 (minimum 3.76), focus >=3:1, 44px targets, distinct semantic edges, legacy Button/Card computed geometry and appearance with pilot rules enabled/disabled, Enter/Space, disabled and asChild semantics, disclosure state, exact reduced-motion behavior, character clipping and horizontal overflow. Zero page errors, external requests, continuous animations or measured layout shifts. Six long tasks were observed across all contexts, maximum 69ms; this is recorded rather than a claim of universal device performance. Full computed evidence is in the adjacent report.json.

Screenshots: [320px light, 200%](semantic-feedback-pilot-20261023/320-light-200-no-preference.png), [390px dark, 100%](semantic-feedback-pilot-20261023/390-dark-100-no-preference.png). Both were visually inspected after the final CSS build.

## Release constraint

Remain draft. No merge/deploy. The inherited Web npm audit DOMPurify failure on main belongs to #1201; no dependency, workflow or gate changes here. Local validation does not imply remote CI approval. Further rollout should be a small PR per surface coordinated with current owners, preserving reduced motion and state authority.
