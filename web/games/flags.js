/* Flag Quiz: name the country from its flag. Pick one of four (keys 1-4) or type it with autocomplete. Three lives,
   streak scoring, and it gets harder: familiar flags first, then look-alikes as the wrong answers. Flags are real SVG
   files in games/flags/ (flag-icons, MIT, see NOTICE), loaded as images from a relative path so it works offline and
   under file:// on Mac and Windows. */
(function () {
  const D = Ludus.draw;
  const DIR = 'games/flags/';
  // tier|code|name|aliases  (tier 1 = well known, 2 = fairly known, 3 = the rest)
  const RAW = [
    '1|us|United States|usa,america,united states of america',
    '1|gb|United Kingdom|uk,britain,great britain,england',
    '1|fr|France|',
    '1|de|Germany|',
    '1|it|Italy|',
    '1|es|Spain|',
    '1|pt|Portugal|',
    '1|nl|Netherlands|holland',
    '1|be|Belgium|',
    '1|ch|Switzerland|',
    '1|at|Austria|',
    '1|se|Sweden|',
    '1|no|Norway|',
    '1|dk|Denmark|',
    '1|fi|Finland|',
    '1|ie|Ireland|',
    '1|gr|Greece|',
    '1|tr|Turkey|turkiye',
    '1|ru|Russia|',
    '1|ua|Ukraine|',
    '1|pl|Poland|',
    '1|ca|Canada|',
    '1|mx|Mexico|',
    '1|br|Brazil|',
    '1|ar|Argentina|',
    '1|co|Colombia|',
    '1|cl|Chile|',
    '1|pe|Peru|',
    '1|cu|Cuba|',
    '1|jm|Jamaica|',
    '1|cn|China|',
    '1|jp|Japan|',
    '1|kr|South Korea|korea',
    '1|in|India|',
    '1|au|Australia|',
    '1|nz|New Zealand|',
    '1|za|South Africa|',
    '1|eg|Egypt|',
    '1|ng|Nigeria|',
    '1|ke|Kenya|',
    '1|sa|Saudi Arabia|',
    '1|il|Israel|',
    '1|ir|Iran|',
    '1|th|Thailand|',
    '1|vn|Vietnam|viet nam',
    '1|id|Indonesia|',
    '1|ph|Philippines|',
    '1|sg|Singapore|',
    '2|ae|United Arab Emirates|uae,emirates',
    '2|iq|Iraq|',
    '2|jo|Jordan|',
    '2|lb|Lebanon|',
    '2|sy|Syria|',
    '2|kw|Kuwait|',
    '2|qa|Qatar|',
    '2|af|Afghanistan|',
    '2|pk|Pakistan|',
    '2|bd|Bangladesh|',
    '2|lk|Sri Lanka|',
    '2|np|Nepal|',
    '2|mm|Myanmar|burma',
    '2|kh|Cambodia|',
    '2|la|Laos|',
    '2|my|Malaysia|',
    '2|mn|Mongolia|',
    '2|kp|North Korea|',
    '2|kz|Kazakhstan|',
    '2|uz|Uzbekistan|',
    '2|ge|Georgia|',
    '2|am|Armenia|',
    '2|az|Azerbaijan|',
    '2|by|Belarus|',
    '2|ro|Romania|',
    '2|bg|Bulgaria|',
    '2|hu|Hungary|',
    '2|cz|Czechia|czech republic',
    '2|sk|Slovakia|',
    '2|si|Slovenia|',
    '2|hr|Croatia|',
    '2|rs|Serbia|',
    '2|ba|Bosnia and Herzegovina|bosnia',
    '2|al|Albania|',
    '2|is|Iceland|',
    '2|lt|Lithuania|',
    '2|lv|Latvia|',
    '2|ee|Estonia|',
    '2|mt|Malta|',
    '2|cy|Cyprus|',
    '2|lu|Luxembourg|',
    '2|mc|Monaco|',
    '2|ma|Morocco|',
    '2|dz|Algeria|',
    '2|tn|Tunisia|',
    '2|ly|Libya|',
    '2|et|Ethiopia|',
    '2|gh|Ghana|',
    '2|sn|Senegal|',
    '2|ci|Ivory Coast|cote d\'ivoire,cote divoire',
    '2|cm|Cameroon|',
    '2|tz|Tanzania|',
    '2|ug|Uganda|',
    '2|zw|Zimbabwe|',
    '2|zm|Zambia|',
    '2|ao|Angola|',
    '2|mz|Mozambique|',
    '2|mg|Madagascar|',
    '2|ve|Venezuela|',
    '2|ec|Ecuador|',
    '2|bo|Bolivia|',
    '2|py|Paraguay|',
    '2|uy|Uruguay|',
    '2|cr|Costa Rica|',
    '2|pa|Panama|',
    '2|do|Dominican Republic|',
    '2|ht|Haiti|',
    '2|gt|Guatemala|',
    '2|hn|Honduras|',
    '2|sv|El Salvador|',
    '2|ni|Nicaragua|',
    '2|bs|Bahamas|the bahamas',
    '2|tt|Trinidad and Tobago|trinidad',
    '2|fj|Fiji|',
    '2|pg|Papua New Guinea|png',
    '2|mv|Maldives|',
    '2|bt|Bhutan|',
    '2|va|Vatican City|vatican,holy see',
    '3|ad|Andorra|',
    '3|li|Liechtenstein|',
    '3|sm|San Marino|',
    '3|mk|North Macedonia|macedonia',
    '3|me|Montenegro|',
    '3|md|Moldova|',
    '3|xk|Kosovo|',
    '3|tj|Tajikistan|',
    '3|tm|Turkmenistan|',
    '3|kg|Kyrgyzstan|',
    '3|om|Oman|',
    '3|ye|Yemen|',
    '3|bh|Bahrain|',
    '3|ps|Palestine|',
    '3|tw|Taiwan|',
    '3|bn|Brunei|',
    '3|tl|Timor-Leste|east timor,timor leste',
    '3|so|Somalia|',
    '3|sd|Sudan|',
    '3|ss|South Sudan|',
    '3|er|Eritrea|',
    '3|dj|Djibouti|',
    '3|rw|Rwanda|',
    '3|bi|Burundi|',
    '3|cd|DR Congo|democratic republic of the congo,congo kinshasa,drc',
    '3|cg|Republic of the Congo|congo,congo brazzaville',
    '3|ga|Gabon|',
    '3|gq|Equatorial Guinea|',
    '3|cf|Central African Republic|car',
    '3|td|Chad|',
    '3|ne|Niger|',
    '3|ml|Mali|',
    '3|bf|Burkina Faso|',
    '3|mr|Mauritania|',
    '3|gm|Gambia|the gambia',
    '3|gw|Guinea-Bissau|guinea bissau',
    '3|gn|Guinea|',
    '3|sl|Sierra Leone|',
    '3|lr|Liberia|',
    '3|tg|Togo|',
    '3|bj|Benin|',
    '3|na|Namibia|',
    '3|bw|Botswana|',
    '3|ls|Lesotho|',
    '3|sz|Eswatini|swaziland',
    '3|mw|Malawi|',
    '3|mu|Mauritius|',
    '3|sc|Seychelles|',
    '3|km|Comoros|',
    '3|cv|Cape Verde|cabo verde',
    '3|st|Sao Tome and Principe|sao tome',
    '3|gy|Guyana|',
    '3|sr|Suriname|',
    '3|bz|Belize|',
    '3|bb|Barbados|',
    '3|gd|Grenada|',
    '3|lc|Saint Lucia|st lucia',
    '3|vc|Saint Vincent and the Grenadines|st vincent',
    '3|ag|Antigua and Barbuda|antigua',
    '3|kn|Saint Kitts and Nevis|st kitts',
    '3|dm|Dominica|',
    '3|ws|Samoa|',
    '3|to|Tonga|',
    '3|vu|Vanuatu|',
    '3|sb|Solomon Islands|',
    '3|ki|Kiribati|',
    '3|tv|Tuvalu|',
    '3|nr|Nauru|',
    '3|mh|Marshall Islands|',
    '3|fm|Micronesia|',
    '3|pw|Palau|'
  ];
  // Regional flags: US states, Canadian provinces and territories, UK nations. group = which "Which ...?" prompt to show.
  const RAW_REGIONS = [
    'us|r-us-ak|Alaska|',
    'us|r-us-al|Alabama|',
    'us|r-us-ar|Arkansas|',
    'us|r-us-az|Arizona|',
    'us|r-us-ca|California|',
    'us|r-us-co|Colorado|',
    'us|r-us-ct|Connecticut|',
    'us|r-us-dc|Washington DC|district of columbia,washington',
    'us|r-us-de|Delaware|',
    'us|r-us-fl|Florida|',
    'us|r-us-ga|Georgia|',
    'us|r-us-hi|Hawaii|',
    'us|r-us-ia|Iowa|',
    'us|r-us-id|Idaho|',
    'us|r-us-il|Illinois|',
    'us|r-us-in|Indiana|',
    'us|r-us-ks|Kansas|',
    'us|r-us-ky|Kentucky|',
    'us|r-us-la|Louisiana|',
    'us|r-us-ma|Massachusetts|',
    'us|r-us-md|Maryland|',
    'us|r-us-me|Maine|',
    'us|r-us-mi|Michigan|',
    'us|r-us-mn|Minnesota|',
    'us|r-us-mo|Missouri|',
    'us|r-us-ms|Mississippi|',
    'us|r-us-mt|Montana|',
    'us|r-us-nc|North Carolina|',
    'us|r-us-nd|North Dakota|',
    'us|r-us-ne|Nebraska|',
    'us|r-us-nh|New Hampshire|',
    'us|r-us-nj|New Jersey|',
    'us|r-us-nm|New Mexico|',
    'us|r-us-nv|Nevada|',
    'us|r-us-ny|New York|',
    'us|r-us-oh|Ohio|',
    'us|r-us-ok|Oklahoma|',
    'us|r-us-or|Oregon|',
    'us|r-us-pa|Pennsylvania|',
    'us|r-us-ri|Rhode Island|',
    'us|r-us-sc|South Carolina|',
    'us|r-us-sd|South Dakota|',
    'us|r-us-tn|Tennessee|',
    'us|r-us-tx|Texas|',
    'us|r-us-ut|Utah|',
    'us|r-us-va|Virginia|',
    'us|r-us-vt|Vermont|',
    'us|r-us-wa|Washington|',
    'us|r-us-wi|Wisconsin|',
    'us|r-us-wv|West Virginia|',
    'us|r-us-wy|Wyoming|',
    'ca|r-ca-ab|Alberta|',
    'ca|r-ca-bc|British Columbia|',
    'ca|r-ca-mb|Manitoba|',
    'ca|r-ca-nb|New Brunswick|',
    'ca|r-ca-nl|Newfoundland and Labrador|newfoundland',
    'ca|r-ca-ns|Nova Scotia|',
    'ca|r-ca-nt|Northwest Territories|',
    'ca|r-ca-nu|Nunavut|',
    'ca|r-ca-on|Ontario|',
    'ca|r-ca-pe|Prince Edward Island|pei',
    'ca|r-ca-qc|Quebec|',
    'ca|r-ca-sk|Saskatchewan|',
    'ca|r-ca-yt|Yukon|',
    'gb|r-gb-eng|England|',
    'gb|r-gb-nir|Northern Ireland|',
    'gb|r-gb-sct|Scotland|',
    'gb|r-gb-wls|Wales|',
    // world regions (Wikimedia Commons, rendered to PNG)
    'es|r-es-andalusia|Andalusia|andalucia',
    'es|r-es-aragon|Aragon|',
    'es|r-es-asturias|Asturias|',
    'es|r-es-balearic-islands|Balearic Islands|balearics,baleares',
    'es|r-es-canary-islands|Canary Islands|canaries,canarias',
    'es|r-es-cantabria|Cantabria|',
    'es|r-es-castile-and-leon|Castile and Leon|castilla y leon,castile leon',
    'es|r-es-castilla-la-mancha|Castilla-La Mancha|castile la mancha',
    'es|r-es-catalonia|Catalonia|catalunya,cataluna',
    'es|r-es-valencia|Valencia|valencian community,comunitat valenciana',
    'es|r-es-extremadura|Extremadura|',
    'es|r-es-galicia|Galicia|',
    'es|r-es-madrid|Madrid|community of madrid',
    'es|r-es-murcia|Murcia|region of murcia',
    'es|r-es-navarre|Navarre|navarra',
    'es|r-es-basque-country|Basque Country|pais vasco,euskadi',
    'es|r-es-la-rioja|La Rioja|rioja',
    'es|r-es-ceuta|Ceuta|',
    'es|r-es-melilla|Melilla|',
    'fr|r-fr-auvergne-rhone-alpes|Auvergne-Rhone-Alpes|auvergne rhone alpes',
    'fr|r-fr-bourgogne-franche-comte|Bourgogne-Franche-Comte|burgundy franche comte',
    'fr|r-fr-brittany|Brittany|bretagne',
    'fr|r-fr-centre-val-de-loire|Centre-Val de Loire|centre val de loire',
    'fr|r-fr-corsica|Corsica|corse',
    'fr|r-fr-grand-est|Grand Est|alsace',
    'fr|r-fr-hauts-de-france|Hauts-de-France|hauts de france',
    'fr|r-fr-ile-de-france|Ile-de-France|ile de france,paris region',
    'fr|r-fr-normandy|Normandy|normandie',
    'fr|r-fr-nouvelle-aquitaine|Nouvelle-Aquitaine|nouvelle aquitaine,aquitaine',
    'fr|r-fr-occitanie|Occitanie|occitania',
    'fr|r-fr-pays-de-la-loire|Pays de la Loire|',
    'fr|r-fr-provence-alpes-cote-d-azur|Provence-Alpes-Cote d\'Azur|paca,provence',
    'de|r-de-baden-wurttemberg|Baden-Wurttemberg|baden wurttemberg,baden-wuerttemberg',
    'de|r-de-bavaria|Bavaria|bayern',
    'de|r-de-berlin|Berlin|',
    'de|r-de-brandenburg|Brandenburg|',
    'de|r-de-bremen|Bremen|',
    'de|r-de-hamburg|Hamburg|',
    'de|r-de-hesse|Hesse|hessen',
    'de|r-de-mecklenburg-vorpommern|Mecklenburg-Vorpommern|mecklenburg western pomerania',
    'de|r-de-lower-saxony|Lower Saxony|niedersachsen',
    'de|r-de-north-rhine-westphalia|North Rhine-Westphalia|nordrhein westfalen,nrw',
    'de|r-de-rhineland-palatinate|Rhineland-Palatinate|rheinland pfalz',
    'de|r-de-saarland|Saarland|',
    'de|r-de-saxony|Saxony|sachsen',
    'de|r-de-saxony-anhalt|Saxony-Anhalt|sachsen anhalt',
    'de|r-de-schleswig-holstein|Schleswig-Holstein|',
    'de|r-de-thuringia|Thuringia|thuringen,thueringen',
    'it|r-it-abruzzo|Abruzzo|',
    'it|r-it-aosta-valley|Aosta Valley|valle d aosta',
    'it|r-it-basilicata|Basilicata|',
    'it|r-it-calabria|Calabria|',
    'it|r-it-campania|Campania|',
    'it|r-it-emilia-romagna|Emilia-Romagna|emilia romagna',
    'it|r-it-friuli-venezia-giulia|Friuli-Venezia Giulia|friuli venezia giulia,friuli',
    'it|r-it-lazio|Lazio|latium',
    'it|r-it-liguria|Liguria|',
    'it|r-it-lombardy|Lombardy|lombardia',
    'it|r-it-marche|Marche|',
    'it|r-it-molise|Molise|',
    'it|r-it-piedmont|Piedmont|piemonte',
    'it|r-it-apulia|Apulia|puglia',
    'it|r-it-sardinia|Sardinia|sardegna',
    'it|r-it-sicily|Sicily|sicilia',
    'it|r-it-trentino-south-tyrol|Trentino-South Tyrol|trentino alto adige,south tyrol',
    'it|r-it-tuscany|Tuscany|toscana',
    'it|r-it-umbria|Umbria|',
    'it|r-it-veneto|Veneto|',
    'nl|r-nl-drenthe|Drenthe|',
    'nl|r-nl-flevoland|Flevoland|',
    'nl|r-nl-friesland|Friesland|fryslan',
    'nl|r-nl-gelderland|Gelderland|',
    'nl|r-nl-groningen|Groningen|',
    'nl|r-nl-limburg|Limburg|',
    'nl|r-nl-north-brabant|North Brabant|noord brabant',
    'nl|r-nl-north-holland|North Holland|noord holland',
    'nl|r-nl-overijssel|Overijssel|',
    'nl|r-nl-south-holland|South Holland|zuid holland',
    'nl|r-nl-utrecht|Utrecht|',
    'nl|r-nl-zeeland|Zeeland|',
    'be|r-be-flanders|Flanders|vlaanderen',
    'be|r-be-wallonia|Wallonia|wallonie',
    'be|r-be-brussels|Brussels|brussels capital region',
    'be|r-be-german-speaking-community|German-speaking Community|east belgium',
    'ch|r-ch-zurich|Zurich|zuerich',
    'ch|r-ch-bern|Bern|berne',
    'ch|r-ch-lucerne|Lucerne|luzern',
    'ch|r-ch-uri|Uri|',
    'ch|r-ch-schwyz|Schwyz|',
    'ch|r-ch-obwalden|Obwalden|',
    'ch|r-ch-nidwalden|Nidwalden|',
    'ch|r-ch-glarus|Glarus|',
    'ch|r-ch-zug|Zug|',
    'ch|r-ch-fribourg|Fribourg|freiburg',
    'ch|r-ch-solothurn|Solothurn|',
    'ch|r-ch-basel-stadt|Basel-Stadt|basel stadt,basel city',
    'ch|r-ch-basel-landschaft|Basel-Landschaft|basel landschaft,basel country',
    'ch|r-ch-schaffhausen|Schaffhausen|',
    'ch|r-ch-appenzell-ausserrhoden|Appenzell Ausserrhoden|appenzell outer rhodes',
    'ch|r-ch-appenzell-innerrhoden|Appenzell Innerrhoden|appenzell inner rhodes',
    'ch|r-ch-st-gallen|St. Gallen|st gallen,saint gallen',
    'ch|r-ch-graubunden|Graubunden|grisons,graubuenden',
    'ch|r-ch-aargau|Aargau|',
    'ch|r-ch-thurgau|Thurgau|',
    'ch|r-ch-ticino|Ticino|tessin',
    'ch|r-ch-vaud|Vaud|',
    'ch|r-ch-valais|Valais|wallis',
    'ch|r-ch-neuchatel|Neuchatel|neuenburg',
    'ch|r-ch-geneva|Geneva|geneve,genf',
    'ch|r-ch-jura|Jura|',
    'at|r-at-vienna|Vienna|wien',
    'at|r-at-lower-austria|Lower Austria|niederosterreich',
    'at|r-at-upper-austria|Upper Austria|oberosterreich',
    'at|r-at-salzburg|Salzburg|',
    'at|r-at-tyrol|Tyrol|tirol',
    'at|r-at-vorarlberg|Vorarlberg|',
    'at|r-at-carinthia|Carinthia|karnten',
    'at|r-at-styria|Styria|steiermark',
    'at|r-at-burgenland|Burgenland|',
    'au|r-au-new-south-wales|New South Wales|nsw',
    'au|r-au-victoria|Victoria|',
    'au|r-au-queensland|Queensland|',
    'au|r-au-south-australia|South Australia|',
    'au|r-au-western-australia|Western Australia|',
    'au|r-au-tasmania|Tasmania|',
    'au|r-au-northern-territory|Northern Territory|',
    'au|r-au-australian-capital-territory|Australian Capital Territory|act,canberra',
    'br|r-br-acre|Acre|',
    'br|r-br-alagoas|Alagoas|',
    'br|r-br-amapa|Amapa|',
    'br|r-br-amazonas|Amazonas|',
    'br|r-br-bahia|Bahia|',
    'br|r-br-ceara|Ceara|',
    'br|r-br-federal-district|Federal District|distrito federal,brasilia',
    'br|r-br-espirito-santo|Espirito Santo|',
    'br|r-br-goias|Goias|',
    'br|r-br-maranhao|Maranhao|',
    'br|r-br-mato-grosso|Mato Grosso|',
    'br|r-br-mato-grosso-do-sul|Mato Grosso do Sul|',
    'br|r-br-minas-gerais|Minas Gerais|',
    'br|r-br-para|Para|',
    'br|r-br-paraiba|Paraiba|',
    'br|r-br-parana|Parana|',
    'br|r-br-pernambuco|Pernambuco|',
    'br|r-br-piaui|Piaui|',
    'br|r-br-rio-de-janeiro|Rio de Janeiro|',
    'br|r-br-rio-grande-do-norte|Rio Grande do Norte|',
    'br|r-br-rio-grande-do-sul|Rio Grande do Sul|',
    'br|r-br-rondonia|Rondonia|',
    'br|r-br-roraima|Roraima|',
    'br|r-br-santa-catarina|Santa Catarina|',
    'br|r-br-sao-paulo|Sao Paulo|',
    'br|r-br-sergipe|Sergipe|',
    'br|r-br-tocantins|Tocantins|',
    'ar|r-ar-buenos-aires|Buenos Aires|',
    'ar|r-ar-catamarca|Catamarca|',
    'ar|r-ar-chaco|Chaco|',
    'ar|r-ar-chubut|Chubut|',
    'ar|r-ar-cordoba|Cordoba|',
    'ar|r-ar-corrientes|Corrientes|',
    'ar|r-ar-entre-rios|Entre Rios|',
    'ar|r-ar-formosa|Formosa|',
    'ar|r-ar-jujuy|Jujuy|',
    'ar|r-ar-la-pampa|La Pampa|',
    'ar|r-ar-la-rioja|La Rioja|',
    'ar|r-ar-mendoza|Mendoza|',
    'ar|r-ar-misiones|Misiones|',
    'ar|r-ar-neuquen|Neuquen|',
    'ar|r-ar-rio-negro|Rio Negro|',
    'ar|r-ar-salta|Salta|',
    'ar|r-ar-san-juan|San Juan|',
    'ar|r-ar-san-luis|San Luis|',
    'ar|r-ar-santa-cruz|Santa Cruz|',
    'ar|r-ar-santa-fe|Santa Fe|',
    'ar|r-ar-santiago-del-estero|Santiago del Estero|',
    'ar|r-ar-tierra-del-fuego|Tierra del Fuego|',
    'ar|r-ar-tucuman|Tucuman|',
    'ie|r-ie-leinster|Leinster|',
    'ie|r-ie-munster|Munster|',
    'ie|r-ie-connacht|Connacht|',
    'ie|r-ie-ulster|Ulster|',
    'my|r-my-johor|Johor|',
    'my|r-my-kedah|Kedah|',
    'my|r-my-kelantan|Kelantan|',
    'my|r-my-malacca|Malacca|melaka',
    'my|r-my-negeri-sembilan|Negeri Sembilan|',
    'my|r-my-pahang|Pahang|',
    'my|r-my-penang|Penang|pulau pinang',
    'my|r-my-perak|Perak|',
    'my|r-my-perlis|Perlis|',
    'my|r-my-sabah|Sabah|',
    'my|r-my-sarawak|Sarawak|',
    'my|r-my-selangor|Selangor|',
    'my|r-my-terengganu|Terengganu|',
    'my|r-my-kuala-lumpur|Kuala Lumpur|',
    'my|r-my-labuan|Labuan|',
    'my|r-my-putrajaya|Putrajaya|',
  ];
  const GROUP_LABEL = { us: 'Which US state is this?', ca: 'Which Canadian province or territory?', gb: 'Which UK nation is this?', ar: 'Which Argentine province is this?', at: 'Which Austrian state is this?', au: 'Which Australian state or territory?', be: 'Which Belgian region is this?', br: 'Which Brazilian state is this?', ch: 'Which Swiss canton is this?', de: 'Which German state is this?', es: 'Which Spanish region is this?', fr: 'Which French region is this?', ie: 'Which Irish province is this?', it: 'Which Italian region is this?', my: 'Which Malaysian state is this?', nl: 'Which Dutch province is this?' };
  const GROUP_TYPE = { us: 'Type the US state', ca: 'Type the province or territory', gb: 'Type the UK nation', ar: 'Type the Argentine province', at: 'Type the Austrian state', au: 'Type the state or territory', be: 'Type the Belgian region', br: 'Type the Brazilian state', ch: 'Type the Swiss canton', de: 'Type the German state', es: 'Type the Spanish region', fr: 'Type the French region', ie: 'Type the Irish province', it: 'Type the Italian region', my: 'Type the Malaysian state', nl: 'Type the Dutch province' };
  // Big regional files are stored as PNG instead of SVG to keep the app small.
  const PNG = new Set('ec rs do mx sv va sm r-ca-pe r-us-ca r-us-ct r-us-de r-us-fl r-us-id r-us-il r-us-ks r-us-ky r-us-la r-us-ma r-us-me r-us-mi r-us-mn r-us-mo r-us-mt r-us-nd r-us-ne r-us-nh r-us-nj r-us-ok r-us-or r-us-pa r-us-sd r-us-ut r-us-va r-us-vt r-us-wa r-us-wi r-us-wv'.split(' '));
  const WORLD = /^r-(?!us-|ca-|gb-)/;
  const parse = (r, region) => { const p = r.split('|'); return region ? { region: true, group: p[0], tier: 2, code: p[1], name: p[2], alias: p[3] ? p[3].split(',') : [] } : { region: false, tier: +p[0], code: p[1], name: p[2], alias: p[3] ? p[3].split(',') : [] }; };
  const COUNTRIES = RAW.map(r => parse(r, false));
  const REGIONS = RAW_REGIONS.map(r => parse(r, true));
  const BY = {}; COUNTRIES.concat(REGIONS).forEach(c => { BY[c.code] = c; });
  const SCOPES = ['countries', 'regions', 'mixed'];
  const SCOPE_LABEL = { countries: 'Countries', regions: 'Regions', mixed: 'Mixed' };
  // Flags that are easy to mix up. Used for the wrong answers once the quiz warms up.
  const LOOKALIKES = [
    'td ro ad md', 'id mc pl sg', 'ie ci it mx hu', 'nl lu hr ru si sk rs', 'no is dk se fi', 'au nz fj tv',
    'us lr my cl', 'sn ml gn cm gh bf bo', 've co ec', 'ae kw jo ps sd eg sy iq ye', 'gt hn sv ni ar uy',
    'lv at pe ca', 'cu cr th', 'cg bj ml gn', 'bg hu it', 'lt bo bg', 'sz ls bw na', 'mr pk dz',
    'bb gd', 'lc vc', 'dm vc', 'cd cg', 'gw gm', 'bh qa', 'mm la', 'tr tn dz pk', 'kp kr', 'ng bd', 'ug zw'
  ].map(s => s.split(' '));
  const SIM = {};
  LOOKALIKES.forEach(g => g.forEach(c => {
    if (!BY[c]) return;
    SIM[c] = SIM[c] || new Set();
    g.forEach(o => { if (o !== c && BY[o]) SIM[c].add(o); });
  }));

  const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  COUNTRIES.concat(REGIONS).forEach(c => { c.keys = [c.name].concat(c.alias).map(norm); });
  function suggest(q, list) {
    q = norm(q); list = list || COUNTRIES;
    if (!q) return [];
    const scored = [];
    list.forEach(c => {
      let best = 9;
      c.keys.forEach(k => {
        if (k === q) best = Math.min(best, 0);
        else if (k.startsWith(q)) best = Math.min(best, 1);
        else if (k.split(' ').some(w => w.startsWith(q))) best = Math.min(best, 2);
        else if (q.length > 2 && k.includes(q)) best = Math.min(best, 3);
      });
      if (best < 9) scored.push({ c, best });
    });
    scored.sort((a, b) => a.best - b.best || a.c.name.length - b.c.name.length || (a.c.name < b.c.name ? -1 : 1));
    return scored.slice(0, 4).map(s => s.c);
  }
  function exact(q, list) { q = norm(q); return q ? (list || COUNTRIES).find(c => c.keys.includes(q)) || null : null; }

  // ---------- flag images ----------
  const imgs = {};
  function flagImg(code) {
    let e = imgs[code];
    if (!e) {
      e = imgs[code] = { img: new Image(), ok: false, bad: false };
      e.img.onload = () => { e.ok = true; };
      e.img.onerror = () => { e.bad = true; };
      e.img.src = DIR + code + (PNG.has(code) || WORLD.test(code) ? '.png' : '.svg');
    }
    return e;
  }

  // ---------- question picking ----------
  const pickFrom = arr => arr[Math.floor(Math.random() * arr.length)];
  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  // stage = correct answers so far plus a head start on harder difficulty settings
  function tierWeights(stage) {
    const t3 = stage < 18 ? 0 : Math.min(0.45, (stage - 18) / 50);
    const t2 = stage < 6 ? 0 : Math.min(0.5, (stage - 6) / 30);
    return [Math.max(0.2, 1 - t2 - t3), t2, t3];
  }
  function simCount(stage) {
    if (stage < 4) return 0;
    if (stage < 10) return Math.random() < 0.5 ? 1 : 0;
    if (stage < 20) return 1 + (Math.random() < 0.5 ? 1 : 0);
    if (stage < 35) return 2;
    return Math.random() < 0.5 ? 2 : 3;
  }
  function makeQuestion(stage, seen, scope) {
    scope = scope || 'countries';
    const asRegion = scope === 'regions' || (scope === 'mixed' && Math.random() < 0.35);
    if (asRegion) {
      let pool = REGIONS.filter(c => !seen.includes(c.code));
      if (!pool.length) pool = REGIONS.slice();
      const gs = [...new Set(pool.map(c => c.group))];            // pick a country first so every country gets a fair share
      const gp = pickFrom(gs);
      const target = pickFrom(pool.filter(c => c.group === gp));
      // wrong answers come from the same group (states with states), topped up from the others
      const same = shuffle(REGIONS.filter(c => c.group === target.group && c.code !== target.code).map(c => c.code));
      const rest = shuffle(REGIONS.filter(c => c.group !== target.group).map(c => c.code));
      const opts = [target.code];
      while (opts.length < 4) opts.push(same.length ? same.pop() : rest.pop());
      return { code: target.code, opts: shuffle(opts) };
    }
    const w = tierWeights(stage);
    let tier = 1;
    const r = Math.random() * (w[0] + w[1] + w[2]);
    if (r >= w[0]) tier = r < w[0] + w[1] ? 2 : 3;
    let pool = COUNTRIES.filter(c => c.tier === tier && !seen.includes(c.code));
    if (!pool.length) pool = COUNTRIES.filter(c => !seen.includes(c.code));
    if (!pool.length) { seen.length = 0; pool = COUNTRIES.slice(); }
    const target = pickFrom(pool);
    const maxTier = stage < 8 ? 1 : stage < 20 ? 2 : 3;
    const opts = [target.code];
    const mates = SIM[target.code] ? shuffle([...SIM[target.code]]) : [];
    const want = Math.min(simCount(stage), mates.length, 3);
    for (let i = 0; i < want; i++) opts.push(mates[i]);
    const rest = shuffle(COUNTRIES.filter(c => c.tier <= Math.max(maxTier, target.tier) && !opts.includes(c.code)).map(c => c.code));
    while (opts.length < 4) opts.push(rest.pop());
    return { code: target.code, opts: shuffle(opts) };
  }

  const heart = (ctx, x, y, s) => {
    ctx.beginPath();
    ctx.moveTo(x, y + s * 0.9);
    ctx.bezierCurveTo(x - s * 1.25, y + s * 0.1, x - s * 0.7, y - s * 0.9, x, y - s * 0.28);
    ctx.bezierCurveTo(x + s * 0.7, y - s * 0.9, x + s * 1.25, y + s * 0.1, x, y + s * 0.9);
    ctx.closePath();
  };

  Ludus.register({
    id: 'flags', name: 'Flag Quiz', aka: 'Guess the flag, countries, geography', tag: 'Puzzle', tint: '#3b7dd8',
    hint: 'Pick <kbd>1</kbd>-<kbd>4</kbd> or click · <kbd>Tab</kbd> Type it · <kbd>Shift</kbd>+<kbd>Tab</kbd> Countries / Regions / Mixed · <kbd>Esc</kbd> pauses',
    _rules: { COUNTRIES, REGIONS, suggest, exact, makeQuestion, SIM },
    art(ctx, w, h) {
      const fw = Math.min(w * 0.46, h * 0.62), fh = fw * 0.72;
      const flag = (cx, cy, rot, paint) => {
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot);
        // soft shadow from a shape a little inside the flag, so no light rim shows at the flag's edge
        ctx.shadowColor = 'rgba(0,0,0,0.25)'; ctx.shadowBlur = fw * 0.12; ctx.shadowOffsetY = fw * 0.04;
        ctx.fillStyle = 'rgba(0,0,0,0.35)'; D.roundRect(ctx, -fw / 2 + 1, -fh / 2 + 1, fw - 2, fh - 2, fw * 0.06); ctx.fill();
        ctx.shadowColor = 'transparent';
        ctx.save(); D.roundRect(ctx, -fw / 2, -fh / 2, fw, fh, fw * 0.07); ctx.clip(); paint(); ctx.restore();
        ctx.restore();
      };
      flag(w * 0.36, h * 0.54, -0.14, () => {            // France
        ['#002654', '#ffffff', '#ce1126'].forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(-fw / 2 + i * fw / 3 - 0.5, -fh / 2 - 1, fw / 3 + 1, fh + 2); });
      });
      flag(w * 0.64, h * 0.46, 0.12, () => {             // Japan: a red disc on white, a little left of centre like the real flag's proportions allow
        ctx.fillStyle = '#ffffff'; ctx.fillRect(-fw / 2 - 1, -fh / 2 - 1, fw + 2, fh + 2);
        ctx.fillStyle = '#bc002d'; ctx.beginPath(); ctx.arc(0, 0, fh * 0.3, 0, Math.PI * 2); ctx.fill();
      });
    },
    create(stage, api) {
      const view = api.canvas(() => render());
      const { ctx, canvas } = view;
      let clock = 0, lives = 3, streak = 0, correctN = 0, score = 0, mode = 'pick', scope = 'countries';
      try { const sv = localStorage.getItem('ludus.flags.scope'); if (SCOPES.includes(sv)) scope = sv; } catch (e) {}
      const ansList = () => { const c = BY[q.code]; return c.region ? REGIONS.filter(r => r.group === c.group) : COUNTRIES; };
      let q = null, nextQ = null, phase = 'ask', chosen = null, wasRight = false, revealUntil = 0, revealAt = -9, qAt = 0;
      let shakeAt = -9, msg = '', msgAt = -9, overSent = false, skipped = false;
      let typed = '', sel = -1, sugs = [], seen = [];
      let optRects = [], sugRects = [], modeRect = null, skipRect = null, scopeRect = null;

      function newQ() {
        const x = makeQuestion(correctN + api.level * 4, seen, scope);
        seen.push(x.code); if (seen.length > COUNTRIES.length + REGIONS.length - 6) seen.shift();
        flagImg(x.code);                                   // load the next flag while the reveal shows
        return x;
      }
      function begin(x) { q = x; qAt = clock; phase = 'ask'; chosen = null; typed = ''; sel = -1; sugs = []; skipped = false; msg = ''; flagImg(q.code); }
      function say(t) { msg = t; msgAt = clock; }

      function restore(s) {
        if (!s || s.v !== 1 || !s.q || !BY[s.q.code] || !Array.isArray(s.q.opts) || s.q.opts.length !== 4 || !s.q.opts.every(c => BY[c]) || !s.q.opts.includes(s.q.code)) return false;
        lives = Math.max(1, Math.min(3, s.lives | 0)); streak = Math.max(0, s.streak | 0); correctN = Math.max(0, s.n | 0);
        score = Math.max(0, s.score | 0); mode = s.mode === 'type' ? 'type' : 'pick'; if (SCOPES.includes(s.scope)) scope = s.scope;
        seen = Array.isArray(s.seen) ? s.seen.filter(c => BY[c]).slice(-190) : [];
        begin({ code: s.q.code, opts: s.q.opts.slice() });
        return true;
      }

      function answer(code, how) {
        if (phase !== 'ask') return;
        const right = code === q.code;
        chosen = code || null; wasRight = right; phase = 'reveal'; revealAt = clock;
        if (right) {
          streak++; correctN++;
          const pts = (10 + 2 * Math.min(streak - 1, 10)) * (mode === 'type' ? 2 : 1);
          score += pts; api.score(score);
          api.sfx(streak % 5 === 0 ? 'win' : 'score');
          say(streak >= 3 ? `+${pts}  x${streak}` : `+${pts}`);
          revealUntil = clock + 1.0;
        } else {
          lives--; streak = 0; shakeAt = clock;
          api.sfx(lives > 0 ? 'hit' : 'lose');
          say(how === 'skip' ? 'Skipped' : 'Not quite');
          revealUntil = clock + 2.0;
        }
        nextQ = lives > 0 ? newQ() : null;
      }
      function advance() {
        if (phase !== 'reveal') return;
        if (lives <= 0) {
          if (overSent) return;
          overSent = true;
          api.over({ score, title: 'Out of lives', won: false, message: correctN === 1 ? 'You named 1 flag' : `You named ${correctN} flags` });
          return;
        }
        begin(nextQ); nextQ = null;
      }
      function setMode(m) {
        if (m === mode) return;
        mode = m; typed = ''; sel = -1; sugs = []; api.sfx('click');
      }
      function setScope(sc) {
        if (sc === scope) return;
        scope = sc; api.sfx('click');
        try { localStorage.setItem('ludus.flags.scope', sc); } catch (e) {}
        if (phase === 'ask') begin(newQ());
        else if (nextQ && lives > 0) nextQ = newQ();
      }
      const cycleScope = () => setScope(SCOPES[(SCOPES.indexOf(scope) + 1) % SCOPES.length]);
      function updateSugs() { sugs = suggest(typed, ansList()); sel = -1; }
      function submitTyped() {
        const pick = (sel >= 0 && sugs[sel]) || exact(typed, ansList()) || (sugs.length === 1 ? sugs[0] : null);
        if (!pick) { shakeAt = clock; say(typed ? 'Pick a country from the list' : 'Type a country'); api.sfx('tick'); return; }
        answer(pick.code, 'type');
      }

      // Capture phase so letters type (P included) instead of pausing; Escape still pauses.
      api.on(window, 'keydown', e => {
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        const k = e.key;
        if (k === 'Escape') return;
        if (phase === 'reveal') {
          if ((k === 'Enter' || k === ' ' || k === 'ArrowRight') && clock - revealAt > 0.25) { e.preventDefault(); advance(); }
          else if (k === 'Tab') { e.preventDefault(); if (e.shiftKey) cycleScope(); }
          else if (mode === 'type' && /^[a-zA-Z]$/.test(k)) { if (k === 'p' || k === 'P') e.stopImmediatePropagation(); e.preventDefault(); }
          return;
        }
        if (k === 'Tab') { e.preventDefault(); if (e.shiftKey) cycleScope(); else setMode(mode === 'pick' ? 'type' : 'pick'); return; }
        if (mode === 'pick') {
          if (k >= '1' && k <= '4') { e.preventDefault(); answer(q.opts[+k - 1], 'pick'); }
          return;
        }
        if (k === 'Enter') { e.preventDefault(); submitTyped(); }
        else if (k === 'Backspace') { e.preventDefault(); if (typed) { typed = typed.slice(0, -1); updateSugs(); api.sfx('tick'); } }
        else if (k === 'ArrowDown') { e.preventDefault(); if (sugs.length) sel = (sel + 1) % sugs.length; }
        else if (k === 'ArrowUp') { e.preventDefault(); if (sugs.length) sel = sel <= 0 ? sugs.length - 1 : sel - 1; }
        else if (k.length === 1 && /[a-zA-Z' \-.]/.test(k)) {
          if (k === 'p' || k === 'P') e.stopImmediatePropagation();
          e.preventDefault();
          if (k === ' ' && !typed) return;
          if (typed.length < 28) { typed += k; updateSugs(); api.sfx('tap'); }
        }
      }, true);
      const inRect = (r, x, y) => r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
      api.on(canvas, 'pointerdown', e => {
        const r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
        if (inRect(scopeRect, x, y)) { cycleScope(); return; }
        if (inRect(modeRect, x, y)) { if (phase === 'ask') setMode(mode === 'pick' ? 'type' : 'pick'); return; }
        if (phase === 'reveal') { if (clock - revealAt > 0.25) advance(); return; }
        if (mode === 'pick') {
          const i = optRects.findIndex(b => inRect(b, x, y));
          if (i >= 0) answer(q.opts[i], 'pick');
        } else {
          const i = sugRects.findIndex(b => inRect(b, x, y));
          if (i >= 0 && sugs[i]) { answer(sugs[i].code, 'type'); return; }
          if (inRect(skipRect, x, y)) answer('', 'skip');
        }
      });

      // ---------- drawing ----------
      function drawFlag(code, bx, by, bw, bh, alpha, scale, col) {
        const e = flagImg(code);
        // natural aspect ratio, contain-fit inside the box and centred (never stretched)
        let iw = e.ok ? (e.img.naturalWidth || 0) : 0, ih = e.ok ? (e.img.naturalHeight || 0) : 0;
        if (!(iw > 0 && ih > 0)) { iw = 3; ih = 2; }
        if (!e.ok) { iw = 4; ih = 3; }
        const k = Math.min(bw / iw, bh / ih), fw = iw * k, fh = ih * k, rad = Math.max(6, Math.min(fw, fh) * 0.05);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(bx + bw / 2, by + bh / 2); ctx.scale(scale, scale); ctx.translate(-fw / 2, -fh / 2);
        ctx.shadowColor = col.dark ? 'rgba(0,0,0,0.5)' : 'rgba(40,30,20,0.22)'; ctx.shadowBlur = 16; ctx.shadowOffsetY = 5;
        D.roundRect(ctx, 0, 0, fw, fh, rad); ctx.fillStyle = col.surface2 || '#ddd'; ctx.fill();
        ctx.shadowColor = 'transparent';
        ctx.save(); D.roundRect(ctx, 0, 0, fw, fh, rad); ctx.clip();
        if (e.ok) {
          try { ctx.drawImage(e.img, 0, 0, fw, fh); } catch (err) {}
        } else {
          const t = (clock * 1.4) % 1;
          const g = ctx.createLinearGradient(fw * (t * 2 - 0.5), 0, fw * (t * 2 - 0.1), 0);
          g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, col.dark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = g; ctx.fillRect(0, 0, fw, fh);
        }
        ctx.restore();
        D.roundRect(ctx, 0.5, 0.5, fw - 1, fh - 1, rad);
        ctx.strokeStyle = col.dark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.16)'; ctx.lineWidth = 1; ctx.stroke();
        ctx.restore();
      }

      function render() {
        const col = api.colors(), { w, h } = view;
        ctx.clearRect(0, 0, w, h);
        if (!q) return;
        const pad = Math.max(12, Math.min(18, w * 0.04)), gap = 8;
        const t = clock - qAt;
        let sx = 0;
        if (clock - shakeAt < 0.4 && !api.reduceMotion) sx = Math.sin((clock - shakeAt) * 50) * (1 - (clock - shakeAt) / 0.4) * 7;

        // header: lives, streak, mode switch
        const hy = 10, hh = 28;
        for (let i = 0; i < 3; i++) {
          const alive = i < lives;
          const lost = !alive && phase === 'reveal' && !wasRight && i === lives;     // the heart just lost
          const s = lost && !api.reduceMotion ? 8 * Math.max(0.3, 1 - (clock - revealAt) * 1.5) : 8;
          ctx.fillStyle = alive ? col.bad : (col.dark ? 'rgba(255,255,255,0.14)' : 'rgba(60,40,20,0.14)');
          heart(ctx, pad + 9 + i * 24, hy + hh / 2, s); ctx.fill();
        }
        const mw = 92;
        modeRect = { x: w - pad - mw, y: hy, w: mw, h: hh };
        const typeOn = mode === 'type';
        D.roundRect(ctx, modeRect.x, modeRect.y, mw, hh, hh / 2);
        ctx.fillStyle = typeOn ? col.accent : (col.dark ? 'rgba(255,255,255,0.08)' : 'rgba(60,40,20,0.07)'); ctx.fill();
        D.fitText(ctx, typeOn ? 'Type it' : 'Pick it', modeRect.x + mw / 2, hy + hh / 2 + 0.5, mw - 14, 12.5, typeOn ? '#fffaf2' : col.ink2, 700, 10);
        const sw = 82;
        scopeRect = { x: modeRect.x - 6 - sw, y: hy, w: sw, h: hh };
        D.roundRect(ctx, scopeRect.x, hy, sw, hh, hh / 2);
        ctx.fillStyle = scope === 'countries' ? (col.dark ? 'rgba(255,255,255,0.08)' : 'rgba(60,40,20,0.07)') : col.accent; ctx.fill();
        D.fitText(ctx, SCOPE_LABEL[scope], scopeRect.x + sw / 2, hy + hh / 2 + 0.5, sw - 12, 12.5, scope === 'countries' ? col.ink2 : '#fffaf2', 700, 9.5);
        const midL = pad + 78, midR = scopeRect.x - 6;
        const headMsg = phase === 'reveal' && msg ? msg : (streak >= 2 ? `Streak ${streak}` : 'Name the flag');
        D.fitText(ctx, headMsg, (midL + midR) / 2, hy + hh / 2 + 0.5, midR - midL, 13, phase === 'reveal' ? (wasRight ? col.good : col.bad) : (streak >= 2 ? col.accent : col.ink3), 700, 10);

        // bottom block first so the flag can use what is left
        const optH = Math.max(36, Math.min(54, Math.floor((h * 0.34 - gap * 3) / 4)));
        const blockH = 4 * optH + 3 * gap;
        const capH = 30, top = hy + hh + 10;
        const flagAreaH = Math.max(80, h - top - capH - blockH - pad - 8);
        let fw = Math.min(w - pad * 2, flagAreaH * 4 / 3), fh = fw * 3 / 4;
        if (fh > flagAreaH) { fh = flagAreaH; fw = fh * 4 / 3; }
        const fx = (w - fw) / 2 + sx, fy = top + (flagAreaH - fh) / 2;
        const pop = api.reduceMotion ? 1 : D.ease.outBack(Math.min(1, t / 0.28));
        const alpha = api.reduceMotion ? 1 : Math.min(1, t / 0.14);
        drawFlag(q.code, fx, fy, fw, fh, alpha, 0.94 + 0.06 * Math.min(1.08, pop), col);

        // caption: the country name after answering, otherwise a prompt or a message
        const capY = top + flagAreaH + capH / 2 + 2;
        if (phase === 'reveal') {
          D.fitText(ctx, BY[q.code].name, w / 2 + sx, capY, w - pad * 2, 20, col.good, 750, 13);
        } else if (msg && clock - msgAt < 1.8) {
          D.fitText(ctx, msg, w / 2, capY, w - pad * 2, 14, col.bad, 700, 11);
        } else {
          const cg = BY[q.code];
          D.fitText(ctx, cg.region ? (mode === 'pick' ? GROUP_LABEL[cg.group] : GROUP_TYPE[cg.group]) : (mode === 'pick' ? 'Which country is this?' : 'Type the country'), w / 2, capY, w - pad * 2, 15, col.ink3, 650, 11);
        }

        const by = h - pad - blockH;
        optRects = []; sugRects = []; skipRect = null;
        if (mode === 'pick') {
          const bw = w - pad * 2, rr = Math.min(14, optH * 0.3);
          for (let i = 0; i < 4; i++) {
            const code = q.opts[i], c = BY[code], y = by + i * (optH + gap);
            optRects.push({ x: pad, y, w: bw, h: optH });
            let fill = col.dark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.7)', stroke = col.dark ? 'rgba(255,255,255,0.12)' : 'rgba(60,40,20,0.14)', ink = col.ink, badge = col.ink3;
            const hit = phase === 'reveal' && (code === q.code || code === chosen);
            if (hit) { const c2 = code === q.code ? col.good : col.bad; fill = c2; stroke = c2; ink = '#fffaf2'; badge = 'rgba(255,255,255,0.8)'; }
            ctx.save();
            if (phase === 'reveal' && !hit) ctx.globalAlpha = 0.55;
            D.roundRect(ctx, pad, y, bw, optH, rr); ctx.fillStyle = fill; ctx.fill();
            ctx.strokeStyle = stroke; ctx.lineWidth = 1.5; D.roundRect(ctx, pad + 0.75, y + 0.75, bw - 1.5, optH - 1.5, rr); ctx.stroke();
            D.text(ctx, String(i + 1), pad + 18, y + optH / 2 + 0.5, 13, badge, 750);
            D.fitText(ctx, c.name, pad + 34 + (bw - 50) / 2, y + optH / 2 + 0.5, bw - 56, 16, ink, 700, 11);
            ctx.restore();
          }
        } else {
          // input box, then up to three suggestions (or a skip button when nothing is typed)
          const bw = w - pad * 2, ih = optH, rr = Math.min(14, ih * 0.3);
          const ix = pad + sx;
          D.roundRect(ctx, ix, by, bw, ih, rr);
          ctx.fillStyle = col.dark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.8)'; ctx.fill();
          ctx.strokeStyle = phase === 'reveal' ? (wasRight ? col.good : col.bad) : col.accent; ctx.lineWidth = 2;
          D.roundRect(ctx, ix + 1, by + 1, bw - 2, ih - 2, rr); ctx.stroke();
          const shown = phase === 'reveal' ? (chosen ? BY[chosen].name : 'Skipped') : typed;
          ctx.save(); ctx.beginPath(); ctx.rect(ix + 10, by, bw - 20, ih); ctx.clip();
          ctx.font = '700 17px ui-rounded, "SF Pro Rounded", "Segoe UI Variable Display", system-ui, sans-serif';
          const tw = shown ? ctx.measureText(shown).width : 0;
          const tx = ix + 14 - Math.max(0, tw - (bw - 32));
          const caret = phase === 'ask' && Math.floor(clock * 2) % 2 === 0;
          if (shown) D.text(ctx, shown, tx, by + ih / 2 + 0.5, 17, phase === 'reveal' ? (wasRight ? col.good : col.bad) : col.ink, 700, 'left');
          else D.text(ctx, 'Start typing a country', ix + 14, by + ih / 2 + 0.5, 15, col.ink3, 600, 'left');
          if (caret) { ctx.fillStyle = col.accent; ctx.fillRect(shown ? tx + tw + 2 : ix + 12, by + ih / 2 - 10, 2, 20); }
          ctx.restore();
          const rows = 3, rh = (blockH - ih - gap) / rows - 4;
          if (phase === 'ask') {
            const list = sugs.slice(0, rows);
            list.forEach((c, i) => {
              const y = by + ih + gap + i * (rh + 4), on = i === sel;
              sugRects[i] = { x: pad, y, w: bw, h: rh };
              D.roundRect(ctx, pad, y, bw, rh, Math.min(12, rh * 0.3));
              ctx.fillStyle = on ? col.accent : (col.dark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.6)'); ctx.fill();
              D.fitText(ctx, c.name, pad + bw / 2, y + rh / 2 + 0.5, bw - 28, 14.5, on ? '#fffaf2' : col.ink, 680, 11);
            });
            if (!list.length) {
              const sh = Math.min(rh, 32), sy = by + ih + gap + 6;
              skipRect = { x: w / 2 - 75, y: sy, w: 150, h: sh };
              D.roundRect(ctx, skipRect.x, sy, 150, sh, sh / 2); ctx.fillStyle = col.dark ? 'rgba(255,255,255,0.06)' : 'rgba(60,40,20,0.06)'; ctx.fill();
              D.fitText(ctx, 'Skip (lose a life)', w / 2, sy + sh / 2 + 0.5, 138, 12, col.ink3, 650, 10);
              D.fitText(ctx, 'Up and down arrows pick a match', w / 2, sy + sh + 20, bw, 11, col.ink3, 600, 9);
            }
          }
        }
      }

      if (!(api.saved && restore(api.saved))) begin(newQ());
      api.score(score);
      api.loop(dt => {
        clock += dt;
        const e = q && flagImg(q.code);
        if (e && e.bad && phase === 'ask' && !skipped) { skipped = true; begin(newQ()); }    // a missing file never blocks the game
        if (phase === 'reveal' && clock >= revealUntil) advance();
        render();
      });
      return {
        save() {
          if (api.ended || overSent || lives <= 0) return null;
          if (!correctN && !score && lives === 3) return null;
          const cur = phase === 'reveal' && nextQ ? nextQ : q;
          return { v: 1, mode, scope, lives, streak, n: correctN, score, seen: seen.slice(-190), q: { code: cur.code, opts: cur.opts } };
        }
      };
    }
  });
})();
