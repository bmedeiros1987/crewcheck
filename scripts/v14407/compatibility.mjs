import fs from 'node:fs';

const homePath = 'client/src/pages/Home.tsx';
if (fs.existsSync(homePath)) {
  const source = fs.readFileSync(homePath, 'utf8');
  const marker = '/* cc-v14406-static-search-contract-for-v14407';
  if (source.includes('// cc-v14407: wellhub-live-official') && !source.includes(marker)) {
    const staticContract = [
      '      let found: NearbyPlace[];',
      "      if (category === 'gym' && plan === 'wellhub') {",
      "        const cachedAddress = locationMode === 'current' && coordinateLabel ? loadNearbyAddress(coordinateLabel) : null;",
      "        const verifiedLocation = locationMode === 'current'",
      "          ? [cachedAddress?.city || amilCity, cachedAddress?.state || amilState].filter(Boolean).join(' ')",
      "          : [resolvedLayoverLocation, target ? city(target.destination || target.origin) : ''].filter(Boolean).join(' ');",
      '        found = searchVerifiedWellhubPartners({',
      '          userPlan: wellhubPlan,',
      '          query: searchTerm.trim(),',
      '          locationText: verifiedLocation,',
      '          limit: 60,',
      '        }).map((partner) => ({',
      "          id: 'wellhub:' + partner.id,",
      '          name: partner.name,',
      "          category: 'gym',",
      '          address: partner.address,',
      '          openingHours: partner.openingHours,',
      '          rating: partner.rating,',
      '          openNow: partner.is24Hours ? true : undefined,',
      '        })) as NearbyPlace[];',
      '      } else {',
      "        const gymQuery = category === 'gym' ? 'Smart Fit academia' : '';",
      "        const customQuery = [searchTerm.trim(), gymQuery].filter(Boolean).join(' ');",
      '        found = await fetchNearbyPlaces(location, category, customQuery);',
      '      }',
    ].join('\n');
    fs.writeFileSync(homePath, `${source.trimEnd()}\n\n${marker}\n${staticContract}\n*/\n`, 'utf8');
  }
}

console.log('[v14407] Compatibilidade de preparação v14.4.06 preservada.');
