/**
 * Image manifest: every photograph shipped with the site, with its licence and credit.
 * Files live in /public/images. The seed script registers these as MediaAsset rows so staff
 * can attach them to destinations and packages; /credits lists the attributions.
 *
 * All images are from Wikimedia Commons under Creative Commons licences that permit commercial
 * use with attribution (BY) and, for BY-SA, share-alike for adaptations. They were resized
 * (an adaptation), so the same licence applies to the resized files. Replace them with the
 * business's own photography whenever it is available (docs/ASSUMPTIONS.md A-09).
 */

export interface ImageManifestEntry {
  key: string;
  path: string;
  alt: string;
  width: number;
  height: number;
  credit: string;
  license: string;
  licenseUrl: string;
  sourceUrl: string;
}

export const IMAGE_MANIFEST = [
  {
    "key": "dal-lake-dusk",
    "path": "/images/kashmir/dal-lake-dusk.jpg",
    "alt": "A shikara on Dal Lake at dusk, with houseboats along the shore in Srinagar",
    "width": 2000,
    "height": 1333,
    "credit": "Photo: Slyronit, via Wikimedia Commons",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Dal_Lake,_Srinagar_at_Dusk.jpg"
  },
  {
    "key": "dal-lake-houseboats",
    "path": "/images/kashmir/dal-lake-houseboats.jpg",
    "alt": "A boatman paddling a shikara past carved wooden houseboats on Dal Lake",
    "width": 2000,
    "height": 1248,
    "credit": "Photo: Abid Sidiq Ahanger, via Wikimedia Commons",
    "license": "CC BY 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/4.0",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Dal_lake_by_Ahanger_HOBO.jpg"
  },
  {
    "key": "dal-lake-floating-market",
    "path": "/images/kashmir/dal-lake-floating-market.jpg",
    "alt": "Shikaras moored beside shops on the waterways of Dal Lake",
    "width": 2000,
    "height": 1333,
    "credit": "Photo: Slyronit, via Wikimedia Commons",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Floating_market_on_Dal_Lake,_Srinagar_2.jpg"
  },
  {
    "key": "shalimar-bagh",
    "path": "/images/kashmir/shalimar-bagh.jpg",
    "alt": "Terraced fountains and chinar trees in Shalimar Bagh, Srinagar",
    "width": 2000,
    "height": 1333,
    "credit": "Photo: Pradeepkjoshi, via Wikimedia Commons",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Shalimar_Bagh,_Srinagar.jpg"
  },
  {
    "key": "gulmarg-snow-meadow",
    "path": "/images/kashmir/gulmarg-snow-meadow.jpg",
    "alt": "Visitors walking across the snow-covered meadow of Gulmarg",
    "width": 2000,
    "height": 1333,
    "credit": "Photo: Slyronit, via Wikimedia Commons",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Gulmarg_2.jpg"
  },
  {
    "key": "gulmarg-kongdoori",
    "path": "/images/kashmir/gulmarg-kongdoori.jpg",
    "alt": "Snowfields and pine-covered slopes at Kongdoori, Gulmarg",
    "width": 2000,
    "height": 1333,
    "credit": "Photo: Slyronit, via Wikimedia Commons",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Kongdoori_Station,_Gulmarg_2.jpg"
  },
  {
    "key": "gulmarg-sunset",
    "path": "/images/kashmir/gulmarg-sunset.jpg",
    "alt": "Sunset over snowy fields and a stream near Gulmarg",
    "width": 2000,
    "height": 1500,
    "credit": "Photo: Koshur, via Wikimedia Commons",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Snowy_sunset_at_Gulmarg.jpg"
  },
  {
    "key": "pahalgam-valley",
    "path": "/images/kashmir/pahalgam-valley.jpg",
    "alt": "Green slopes and pine forest along the river valley at Pahalgam",
    "width": 2000,
    "height": 1116,
    "credit": "Photo: KennyOMG, via Wikimedia Commons",
    "license": "CC BY-SA 3.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/3.0",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Pahalgam_Valley.jpg"
  },
  {
    "key": "pahalgam-lidder-river",
    "path": "/images/kashmir/pahalgam-lidder-river.jpg",
    "alt": "The Lidder River running over stones through Pahalgam",
    "width": 2000,
    "height": 1333,
    "credit": "Photo: Slyronit, via Wikimedia Commons",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Lidder_at_Pahalgam.jpg"
  },
  {
    "key": "betaab-valley",
    "path": "/images/kashmir/betaab-valley.jpg",
    "alt": "A riverside path through Betaab Valley near Pahalgam",
    "width": 2000,
    "height": 1500,
    "credit": "Photo: ThePoeticFrame, via Wikimedia Commons",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Betaab_Valley,_Pahalgam,_Kashmir.jpg"
  },
  {
    "key": "pahalgam-forest-trail",
    "path": "/images/kashmir/pahalgam-forest-trail.jpg",
    "alt": "A snowy forest trail with a pony near Pahalgam",
    "width": 2000,
    "height": 1333,
    "credit": "Photo: Slyronit, via Wikimedia Commons",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Trek_through_Kashmir_Valley,_Pahalgam_3.jpg"
  },
  {
    "key": "sonamarg-thajiwas",
    "path": "/images/kashmir/sonamarg-thajiwas.jpg",
    "alt": "Snow peaks above the pine forest at Thajiwas, Sonamarg",
    "width": 2000,
    "height": 1219,
    "credit": "Photo: Ganesh Mohan T (derivative work by UnpetitproleX), via Wikimedia Commons",
    "license": "CC BY 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/4.0",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Thajiwas_Park,_Sonamarg,_Jammu_and_Kashmir,_India.jpg"
  },
  {
    "key": "sonamarg-autumn",
    "path": "/images/kashmir/sonamarg-autumn.jpg",
    "alt": "Autumn colours in a meadow below the mountains at Sonamarg",
    "width": 2000,
    "height": 1332,
    "credit": "Photo: Tony Gladvin George, via Wikimedia Commons",
    "license": "CC BY 2.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/2.0",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Sonamarg,_Kashmir,_October_2007.jpg"
  },
  {
    "key": "thajiwas-glacier",
    "path": "/images/kashmir/thajiwas-glacier.jpg",
    "alt": "The Thajiwas Glacier beneath jagged peaks near Sonamarg",
    "width": 2000,
    "height": 1333,
    "credit": "Photo: Madhrakangri, via Wikimedia Commons",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Thajiwas_Glacier_at_Sonmarg,_June_2026.jpg"
  }
] as const satisfies readonly ImageManifestEntry[];

export type ImageKey = (typeof IMAGE_MANIFEST)[number]["key"];

export function manifestImage(key: ImageKey): ImageManifestEntry {
  const entry = IMAGE_MANIFEST.find((image) => image.key === key);
  if (!entry) throw new Error(`Unknown image ${key}`);
  return entry;
}
