/* ---------- TMDB: built-in catalog addons (tmdb://all, tmdb://netflix, tmdb://disney, tmdb://kids), using the TMDB key from Settings.
   Titles carry their IMDb id (tt…) so every stream addon finds them; the details and episodes come from TMDB too. ---------- */
const TM_IMG = 'https://image.tmdb.org/t/p/';
const TM_REGION = 'CA';
const TM_FLAVORS = {
  all:     {name:'TMDB',          desc:'Trending, popular and top rated movies and shows, with search.'},
  netflix: {name:'Netflix (TMDB)', desc:'What is on Netflix in Canada, and Netflix originals.'},
  disney:  {name:'Disney+ (TMDB)', desc:'Disney, Pixar, Marvel, Star Wars and Disney Channel, like the Disney+ catalog.'},
  marvel:  {name:'Marvel (TMDB)',  desc:'The MCU in release order, Marvel shows, X-Men, Spider-Man and Marvel Animation.'},
  kids:    {name:'Kids (TMDB)',    desc:'Family movies rated G and PG, cartoons and kids shows. Search only finds kids titles.'}
};
const TM_MG = {Action:28, Adventure:12, Animation:16, Comedy:35, Crime:80, Documentary:99, Drama:18, Family:10751, Fantasy:14, History:36, Horror:27, Music:10402, Mystery:9648, Romance:10749, 'Science Fiction':878, Thriller:53, War:10752, Western:37};
const TM_TG = {'Action & Adventure':10759, Animation:16, Comedy:35, Crime:80, Documentary:99, Drama:18, Family:10751, Kids:10762, Mystery:9648, Reality:10764, 'Sci-Fi & Fantasy':10765, 'War & Politics':10768, Western:37};
const TM_KID_MG = ['Adventure', 'Animation', 'Comedy', 'Family', 'Fantasy', 'Music'], TM_KID_TG = ['Action & Adventure', 'Animation', 'Comedy', 'Family', 'Kids'];
const TM_KIDM = {certification_country:'US', 'certification.lte':'PG'};                 // kids movies: rated G or PG
/* each catalog: a TMDB list (paged) or a discover query; 'co:Name' and 'prov:Name' are looked up by name with your key */
const TM_CATS = {
  all: [
    {type:'movie',  id:'tm.trend', name:'Trending movies',  list:'/trending/movie/week'},
    {type:'movie',  id:'tm.pop',   name:'Popular movies',   list:'/movie/popular?region=' + TM_REGION},
    {type:'movie',  id:'tm.now',   name:'In theaters',      list:'/movie/now_playing?region=' + TM_REGION},
    {type:'movie',  id:'tm.top',   name:'Top rated movies', list:'/movie/top_rated'},
    {type:'series', id:'tm.trend', name:'Trending shows',   list:'/trending/tv/week'},
    {type:'series', id:'tm.pop',   name:'Popular shows',    list:'/tv/popular'},
    {type:'series', id:'tm.air',   name:'On the air',       list:'/tv/on_the_air'},
    {type:'series', id:'tm.top',   name:'Top rated shows',  list:'/tv/top_rated'}
  ],
  netflix: [
    {type:'series', id:'nf.orig', name:'Netflix originals',      disc:{with_networks:'213'}},
    {type:'series', id:'nf.pop',  name:'Popular shows on Netflix', disc:{with_watch_providers:'prov:Netflix'}},
    {type:'movie',  id:'nf.pop',  name:'Popular movies on Netflix', disc:{with_watch_providers:'prov:Netflix'}},
    {type:'movie',  id:'nf.top',  name:'Top rated on Netflix',   disc:{with_watch_providers:'prov:Netflix', sort_by:'vote_average.desc', 'vote_count.gte':'400'}},
    {type:'series', id:'nf.top',  name:'Top rated shows on Netflix', disc:{with_watch_providers:'prov:Netflix', sort_by:'vote_average.desc', 'vote_count.gte':'300'}}
  ],
  kids: [
    {type:'movie',  id:'kd.pop',    name:'Family movies',      disc:{...TM_KIDM, with_genres:'10751'}},
    {type:'movie',  id:'kd.anim',   name:'Animated movies',    disc:{...TM_KIDM, with_genres:'16'}},
    {type:'movie',  id:'kd.disney', name:'Disney and Pixar',   disc:{...TM_KIDM, with_companies:'co:Walt Disney Pictures|co:Pixar|co:Walt Disney Animation Studios'}},
    {type:'series', id:'kd.shows',  name:'Kids shows',         disc:{with_genres:'10762'}},
    {type:'series', id:'kd.toons',  name:'Cartoons',           disc:{with_genres:'16,10762'}},
    {type:'series', id:'kd.chan',   name:'Disney Channel',     disc:{with_networks:'54'}}
  ]
};
/* ---------- Marvel (TMDB): the MCU from a hand-kept list (only titles Marvel Studios counts as the MCU), then the rest of Marvel, sorted by family.
   Titles are found on TMDB by name and year, so nothing here depends on an id typed by hand. 't|year|tv' marks a series. ---------- */
const MCU_PHASES = [
  ['Iron Man|2008', 'The Incredible Hulk|2008', 'Iron Man 2|2010', 'Thor|2011', 'Captain America: The First Avenger|2011', 'The Avengers|2012'],
  ['Iron Man 3|2013', 'Thor: The Dark World|2013', 'Captain America: The Winter Soldier|2014', 'Guardians of the Galaxy|2014', 'Avengers: Age of Ultron|2015', 'Ant-Man|2015'],
  ['Captain America: Civil War|2016', 'Doctor Strange|2016', 'Guardians of the Galaxy Vol. 2|2017', 'Spider-Man: Homecoming|2017', 'Thor: Ragnarok|2017', 'Black Panther|2018', 'Avengers: Infinity War|2018', 'Ant-Man and the Wasp|2018', 'Captain Marvel|2019', 'Avengers: Endgame|2019', 'Spider-Man: Far From Home|2019'],
  ['WandaVision|2021|tv', 'The Falcon and the Winter Soldier|2021|tv', 'Loki|2021|tv', 'Black Widow|2021', 'Shang-Chi and the Legend of the Ten Rings|2021', 'Eternals|2021', 'Hawkeye|2021|tv', 'Spider-Man: No Way Home|2021', 'Moon Knight|2022|tv', 'Doctor Strange in the Multiverse of Madness|2022', 'Ms. Marvel|2022|tv', 'Thor: Love and Thunder|2022', 'She-Hulk: Attorney at Law|2022|tv', 'Werewolf by Night|2022', 'Black Panther: Wakanda Forever|2022', 'The Guardians of the Galaxy Holiday Special|2022'],
  ['Ant-Man and the Wasp: Quantumania|2023', 'Guardians of the Galaxy Vol. 3|2023', 'Secret Invasion|2023|tv', 'The Marvels|2023', 'Echo|2024|tv', 'Deadpool & Wolverine|2024', 'Agatha All Along|2024|tv', 'Captain America: Brave New World|2025', 'Daredevil: Born Again|2025|tv', 'Thunderbolts*|2025', 'Ironheart|2025|tv'],
  ['The Fantastic Four: First Steps|2025', 'Wonder Man|2026|tv', 'Spider-Man: Brand New Day|2026', 'Avengers: Doomsday|2026']
];
const MCU_PHASE_NAMES = ['Phase One', 'Phase Two', 'Phase Three', 'Phase Four', 'Phase Five', 'Phase Six'];
/* the story's own order (Marvel's official timeline); The Fantastic Four: First Steps happens on another Earth, so it closes the list */
const MCU_CHRONO = ['Captain America: The First Avenger', 'Captain Marvel', 'Iron Man', 'Iron Man 2', 'The Incredible Hulk', 'Thor', 'The Avengers', 'Thor: The Dark World', 'Iron Man 3',
  'Captain America: The Winter Soldier', 'Guardians of the Galaxy', 'Guardians of the Galaxy Vol. 2', 'Avengers: Age of Ultron', 'Ant-Man', 'Captain America: Civil War', 'Black Widow',
  'Black Panther', 'Spider-Man: Homecoming', 'Doctor Strange', 'Thor: Ragnarok', 'Ant-Man and the Wasp', 'Avengers: Infinity War', 'Avengers: Endgame', 'Loki', 'WandaVision',
  'The Falcon and the Winter Soldier', 'Spider-Man: Far From Home', 'Shang-Chi and the Legend of the Ten Rings', 'Eternals', 'Spider-Man: No Way Home', 'Hawkeye',
  'Doctor Strange in the Multiverse of Madness', 'Moon Knight', 'Black Panther: Wakanda Forever', 'Echo', 'She-Hulk: Attorney at Law', 'Ms. Marvel', 'Thor: Love and Thunder',
  'Werewolf by Night', 'The Guardians of the Galaxy Holiday Special', 'Ant-Man and the Wasp: Quantumania', 'Guardians of the Galaxy Vol. 3', 'Secret Invasion', 'The Marvels',
  'Deadpool & Wolverine', 'Agatha All Along', 'Daredevil: Born Again', 'Captain America: Brave New World', 'Thunderbolts*', 'Ironheart', 'Wonder Man', 'Spider-Man: Brand New Day',
  'Avengers: Doomsday', 'The Fantastic Four: First Steps'];
const MCU_HEROES = [
  ['The Avengers',       ['The Avengers', 'Avengers: Age of Ultron', 'Avengers: Infinity War', 'Avengers: Endgame', 'Avengers: Doomsday']],
  ['Iron Man',           ['Iron Man', 'Iron Man 2', 'Iron Man 3']],
  ['Captain America',    ['Captain America: The First Avenger', 'Captain America: The Winter Soldier', 'Captain America: Civil War', 'The Falcon and the Winter Soldier', 'Captain America: Brave New World']],
  ['Thor',               ['Thor', 'Thor: The Dark World', 'Thor: Ragnarok', 'Thor: Love and Thunder']],
  ['Spider-Man',         ['Spider-Man: Homecoming', 'Spider-Man: Far From Home', 'Spider-Man: No Way Home', 'Spider-Man: Brand New Day']],
  ['Guardians of the Galaxy', ['Guardians of the Galaxy', 'Guardians of the Galaxy Vol. 2', 'The Guardians of the Galaxy Holiday Special', 'Guardians of the Galaxy Vol. 3']],
  ['Hulk',               ['The Incredible Hulk', 'She-Hulk: Attorney at Law']],
  ['Doctor Strange',     ['Doctor Strange', 'Doctor Strange in the Multiverse of Madness']],
  ['Ant-Man',            ['Ant-Man', 'Ant-Man and the Wasp', 'Ant-Man and the Wasp: Quantumania']],
  ['Black Panther',      ['Black Panther', 'Black Panther: Wakanda Forever', 'Ironheart']],
  ['Captain Marvel',     ['Captain Marvel', 'Ms. Marvel', 'The Marvels']],
  ['Black Widow and Hawkeye', ['Black Widow', 'Hawkeye', 'Echo', 'Thunderbolts*']],
  ['Wanda and Agatha',   ['WandaVision', 'Agatha All Along']],
  ['Loki',               ['Loki']],
  ['Daredevil',          ['Daredevil: Born Again']]
];
/* the rest of Marvel: never in the MCU lists above */
const MARVEL_MORE = [
  ['X-Men (before the MCU)', ['X-Men|2000', 'X2|2003', 'X-Men: The Last Stand|2006', 'X-Men Origins: Wolverine|2009', 'X-Men: First Class|2011', 'The Wolverine|2013', 'X-Men: Days of Future Past|2014', 'Deadpool|2016', 'X-Men: Apocalypse|2016', 'Logan|2017', 'Deadpool 2|2018', 'Dark Phoenix|2019', 'The New Mutants|2020', 'Legion|2017|tv', 'The Gifted|2017|tv']],
  ['Spider-Man (Sony)', ['Spider-Man|2002', 'Spider-Man 2|2004', 'Spider-Man 3|2007', 'The Amazing Spider-Man|2012', 'The Amazing Spider-Man 2|2014', 'Spider-Man: Into the Spider-Verse|2018', 'Spider-Man: Across the Spider-Verse|2023']],
  ['Venom and Sony villains', ['Venom|2018', 'Venom: Let There Be Carnage|2021', 'Morbius|2022', 'Madame Web|2024', 'Venom: The Last Dance|2024', 'Kraven the Hunter|2024']],
  ['Fantastic Four (before the MCU)', ['Fantastic Four|2005', 'Fantastic Four: Rise of the Silver Surfer|2007', 'Fantastic Four|2015']],
  ['Marvel Television', ['Agents of S.H.I.E.L.D.|2013|tv', 'Agent Carter|2015|tv', 'Daredevil|2015|tv', 'Jessica Jones|2015|tv', 'Luke Cage|2016|tv', 'Iron Fist|2017|tv', 'The Defenders|2017|tv', 'The Punisher|2017|tv', 'Inhumans|2017|tv', 'Runaways|2017|tv', 'Cloak & Dagger|2018|tv', 'Helstrom|2020|tv']],
  ['Marvel animation', ['What If...?|2021|tv', 'I Am Groot|2022|tv', "X-Men '97|2024|tv", 'Your Friendly Neighborhood Spider-Man|2025|tv', 'Eyes of Wakanda|2025|tv', 'Marvel Zombies|2025|tv', 'X-Men: The Animated Series|1992|tv', 'Spider-Man: The Animated Series|1994|tv', 'The Spectacular Spider-Man|2008|tv', 'Avengers Assemble|2013|tv']],
  ['More Marvel movies', ['Blade|1998', 'Blade II|2002', 'Blade: Trinity|2004', 'Hulk|2003', 'Daredevil|2003', 'Elektra|2005', 'The Punisher|2004', 'Punisher: War Zone|2008', 'Ghost Rider|2007', 'Ghost Rider: Spirit of Vengeance|2012']]
];
const MCU_ALL = MCU_PHASES.flat(), mcuEntry = t => MCU_ALL.find(x => x.split('|')[0] === t) || t;
const tmCur = (id, name, list) => ({type:'movie', id, name, cur:list});
TM_CATS.marvel = [
  tmCur('mv.chrono', 'MCU in story order', MCU_CHRONO.map(mcuEntry)),
  tmCur('mv.release', 'MCU in release order', MCU_ALL),
  ...MCU_PHASES.map((p, i) => tmCur('mv.p' + (i + 1), 'MCU ' + MCU_PHASE_NAMES[i], p)),
  ...MCU_HEROES.map(([n, l], i) => tmCur('mv.h' + i, n, l.map(mcuEntry))),
  ...MARVEL_MORE.map(([n, l], i) => tmCur('mv.m' + i, n, l))
];
/* ---------- Disney+ (TMDB): kept lists by studio and era, matched on TMDB by name and year ('|tv' = a series) ---------- */
const DZ = {
  golden:  ['Snow White and the Seven Dwarfs|1937', 'Pinocchio|1940', 'Fantasia|1940', 'Dumbo|1941', 'Bambi|1942'],
  wartime: ['Saludos Amigos|1942', 'The Three Caballeros|1944', 'Make Mine Music|1946', 'Fun and Fancy Free|1947', 'Melody Time|1948', 'The Adventures of Ichabod and Mr. Toad|1949'],
  silver:  ['Cinderella|1950', 'Alice in Wonderland|1951', 'Peter Pan|1953', 'Lady and the Tramp|1955', 'Sleeping Beauty|1959', 'One Hundred and One Dalmatians|1961', 'The Sword in the Stone|1963', 'The Jungle Book|1967'],
  bronze:  ['The Aristocats|1970', 'Robin Hood|1973', 'The Many Adventures of Winnie the Pooh|1977', 'The Rescuers|1977', 'The Fox and the Hound|1981', 'The Black Cauldron|1985', 'The Great Mouse Detective|1986', 'Oliver & Company|1988'],
  renaissance: ['The Little Mermaid|1989', 'The Rescuers Down Under|1990', 'Beauty and the Beast|1991', 'Aladdin|1992', 'The Lion King|1994', 'Pocahontas|1995', 'The Hunchback of Notre Dame|1996', 'Hercules|1997', 'Mulan|1998', 'Tarzan|1999'],
  post:    ['Fantasia 2000|1999', 'Dinosaur|2000', "The Emperor's New Groove|2000", 'Atlantis: The Lost Empire|2001', 'Lilo & Stitch|2002', 'Treasure Planet|2002', 'Brother Bear|2003', 'Home on the Range|2004', 'Chicken Little|2005', 'Meet the Robinsons|2007', 'Bolt|2008', 'The Princess and the Frog|2009'],
  modern:  ['Tangled|2010', 'Winnie the Pooh|2011', 'Wreck-It Ralph|2012', 'Frozen|2013', 'Big Hero 6|2014', 'Zootopia|2016', 'Moana|2016', 'Ralph Breaks the Internet|2018', 'Frozen II|2019', 'Raya and the Last Dragon|2021', 'Encanto|2021', 'Strange World|2022', 'Wish|2023', 'Moana 2|2024', 'Zootopia 2|2025'],
  pixar:   ['Toy Story|1995', "A Bug's Life|1998", 'Toy Story 2|1999', 'Monsters, Inc.|2001', 'Finding Nemo|2003', 'The Incredibles|2004', 'Cars|2006', 'Ratatouille|2007', 'WALL·E|2008', 'Up|2009', 'Toy Story 3|2010', 'Cars 2|2011', 'Brave|2012', 'Monsters University|2013', 'Inside Out|2015', 'The Good Dinosaur|2015', 'Finding Dory|2016', 'Cars 3|2017', 'Coco|2017', 'Incredibles 2|2018', 'Toy Story 4|2019', 'Onward|2020', 'Soul|2020', 'Luca|2021', 'Turning Red|2022', 'Lightyear|2022', 'Elemental|2023', 'Inside Out 2|2024', 'Elio|2025', 'Hoppers|2026', 'Toy Story 5|2026'],
  toystory: ['Toy Story|1995', 'Toy Story 2|1999', 'Toy Story 3|2010', 'Toy Story 4|2019', 'Lightyear|2022', 'Toy Story 5|2026'],
  cars:    ['Cars|2006', 'Cars 2|2011', 'Planes|2013', 'Planes: Fire & Rescue|2014', 'Cars 3|2017', 'Cars on the Road|2022|tv'],
  incredibles: ['The Incredibles|2004', 'Incredibles 2|2018'],
  pixarMore: ['Finding Nemo|2003', 'Finding Dory|2016', 'Monsters, Inc.|2001', 'Monsters University|2013', 'Monsters at Work|2021|tv', 'Inside Out|2015', 'Inside Out 2|2024', 'Dream Productions|2024|tv'],
  remakes: ['101 Dalmatians|1996', 'Alice in Wonderland|2010', 'Maleficent|2014', 'Cinderella|2015', 'The Jungle Book|2016', "Pete's Dragon|2016", 'Beauty and the Beast|2017', 'Christopher Robin|2018', 'Dumbo|2019', 'Aladdin|2019', 'The Lion King|2019', 'Lady and the Tramp|2019', 'Maleficent: Mistress of Evil|2019', 'Mulan|2020', 'Cruella|2021', 'Pinocchio|2022', 'Peter Pan & Wendy|2023', 'The Little Mermaid|2023', 'Mufasa: The Lion King|2024', 'Snow White|2025', 'Lilo & Stitch|2025'],
  live:    ['The Parent Trap|1961', 'Mary Poppins|1964', 'Tron|1982', 'Honey, I Shrunk the Kids|1989', 'Hocus Pocus|1993', 'The Santa Clause|1994', 'The Parent Trap|1998', 'The Princess Diaries|2001', 'Freaky Friday|2003', 'Holes|2003', 'National Treasure|2004', 'Enchanted|2007', 'Tron: Legacy|2010', 'Mary Poppins Returns|2018', 'Jungle Cruise|2021', 'Hocus Pocus 2|2022', 'Disenchanted|2022', 'Freakier Friday|2025', 'Tron: Ares|2025'],
  pirates: ['Pirates of the Caribbean: The Curse of the Black Pearl|2003', "Pirates of the Caribbean: Dead Man's Chest|2006", "Pirates of the Caribbean: At World's End|2007", 'Pirates of the Caribbean: On Stranger Tides|2011', 'Pirates of the Caribbean: Dead Men Tell No Tales|2017'],
  channel: ['Even Stevens|2000|tv', 'Lizzie McGuire|2001|tv', "That's So Raven|2003|tv", 'The Suite Life of Zack & Cody|2005|tv', 'Hannah Montana|2006|tv', 'Wizards of Waverly Place|2007|tv', 'The Suite Life on Deck|2008|tv', 'Sonny with a Chance|2009|tv', 'Good Luck Charlie|2010|tv', 'Jessie|2011|tv', 'Austin & Ally|2011|tv', 'Liv and Maddie|2013|tv', 'Girl Meets World|2014|tv', 'K.C. Undercover|2015|tv', 'Bunk\'d|2015|tv', 'Andi Mack|2017|tv', "Raven's Home|2017|tv", 'Wizards Beyond Waverly Place|2024|tv'],
  dcom:    ['Halloweentown|1998', 'Smart House|1999', 'Cadet Kelly|2002', 'High School Musical|2006', 'High School Musical 2|2007', 'Camp Rock|2008', 'High School Musical 3: Senior Year|2008', 'Starstruck|2010', 'Teen Beach Movie|2013', 'Descendants|2015', 'Descendants 2|2017', 'Zombies|2018', 'Descendants 3|2019', 'Zombies 2|2020', 'Descendants: The Rise of Red|2024'],
  toons:   ['DuckTales|1987|tv', "Chip 'n' Dale: Rescue Rangers|1989|tv", 'TaleSpin|1990|tv', 'Darkwing Duck|1991|tv', 'Goof Troop|1992|tv', 'Gargoyles|1994|tv', 'Recess|1997|tv', 'The Proud Family|2001|tv', 'Kim Possible|2002|tv', 'Lilo & Stitch: The Series|2003|tv', 'American Dragon: Jake Long|2005|tv', 'The Replacements|2006|tv', 'Phineas and Ferb|2007|tv', 'Gravity Falls|2012|tv', 'Star vs. the Forces of Evil|2015|tv', 'DuckTales|2017|tv', 'Tangled: The Series|2017|tv', 'Big City Greens|2018|tv', 'Amphibia|2019|tv', 'The Owl House|2020|tv', 'Moon Girl and Devil Dinosaur|2023|tv'],
  junior:  ['Little Einsteins|2005|tv', 'Mickey Mouse Clubhouse|2006|tv', 'Handy Manny|2006|tv', 'Special Agent Oso|2009|tv', 'Jake and the Never Land Pirates|2011|tv', 'Doc McStuffins|2012|tv', 'Sofia the First|2013|tv', 'The Lion Guard|2016|tv', 'Elena of Avalor|2016|tv', 'Puppy Dog Pals|2017|tv', 'Vampirina|2017|tv', 'Mickey and the Roadster Racers|2017|tv', 'T.O.T.S.|2019|tv', 'Spidey and His Amazing Friends|2021|tv', 'Mickey Mouse Funhouse|2021|tv', "Alice's Wonderland Bakery|2022|tv", 'SuperKitties|2023|tv', 'Star Wars: Young Jedi Adventures|2023|tv', 'Ariel|2024|tv'],
  plusLive: ['The Mandalorian|2019|tv', 'High School Musical: The Musical: The Series|2019|tv', 'Diary of a Future President|2020|tv', 'The Book of Boba Fett|2021|tv', 'Big Shot|2021|tv', 'The Mighty Ducks: Game Changers|2021|tv', 'Doogie Kameāloha, M.D.|2021|tv', 'Obi-Wan Kenobi|2022|tv', 'Andor|2022|tv', 'The Santa Clauses|2022|tv', 'Willow|2022|tv', 'National Treasure: Edge of History|2022|tv', 'Ahsoka|2023|tv', 'Percy Jackson and the Olympians|2023|tv', 'The Acolyte|2024|tv', 'Star Wars: Skeleton Crew|2024|tv'],
  plusAnim: ['Star Wars: The Bad Batch|2021|tv', 'Star Wars: Visions|2021|tv', 'Monsters at Work|2021|tv', 'Zootopia+|2022|tv', 'Baymax!|2022|tv', 'Cars on the Road|2022|tv', 'Tales of the Jedi|2022|tv', 'Iwájú|2024|tv', 'Dream Productions|2024|tv', 'Win or Lose|2025|tv'],
  plusDocs: ['The Imagineering Story|2019|tv', 'The World According to Jeff Goldblum|2019|tv', 'Encore!|2019|tv', 'Disney Gallery: The Mandalorian|2020|tv', 'Prop Culture|2020|tv', 'Behind the Attraction|2021|tv']
};
TM_CATS.disney = [
  {type:'series', id:'dz.plus', name:'Popular on Disney+', disc:{with_watch_providers:'prov:Disney Plus'}},   // the one row that follows what's new by itself
  tmCur('dz.golden', 'Disney Animation · Golden Age', DZ.golden),
  tmCur('dz.wartime', 'Disney Animation · Wartime era', DZ.wartime),
  tmCur('dz.silver', 'Disney Animation · Silver Age', DZ.silver),
  tmCur('dz.bronze', 'Disney Animation · Bronze Age', DZ.bronze),
  tmCur('dz.ren', 'Disney Animation · Renaissance', DZ.renaissance),
  tmCur('dz.post', 'Disney Animation · Post-Renaissance', DZ.post),
  tmCur('dz.modern', 'Disney Animation · Modern era', DZ.modern),
  tmCur('dz.pixar', 'Pixar · All movies, newest first', DZ.pixar.slice().reverse()),
  tmCur('dz.pixarRel', 'Pixar · Release order', DZ.pixar),
  tmCur('dz.toy', 'Toy Story collection', DZ.toystory),
  tmCur('dz.cars', 'Cars collection', DZ.cars),
  tmCur('dz.inc', 'Incredibles collection', DZ.incredibles),
  tmCur('dz.pixMore', 'Nemo, Monsters and Inside Out', DZ.pixarMore),
  tmCur('dz.remakes', 'Live-action remakes', DZ.remakes),
  tmCur('dz.live', 'Original live-action Disney films', DZ.live),
  tmCur('dz.pirates', 'Pirates of the Caribbean', DZ.pirates),
  tmCur('dz.channel', 'Disney Channel series', DZ.channel),
  tmCur('dz.dcom', 'Disney Channel Original Movies', DZ.dcom),
  tmCur('dz.toons', 'Disney Television Animation', DZ.toons),
  tmCur('dz.junior', 'Disney Junior', DZ.junior),
  tmCur('dz.plusLive', 'Disney+ Originals · Series', DZ.plusLive),
  tmCur('dz.plusAnim', 'Disney+ Originals · Animated', DZ.plusAnim),
  tmCur('dz.plusDocs', 'Disney+ Originals · Docuseries', DZ.plusDocs)
];
TM_FLAVORS.disney.desc = 'Disney Animation by era, Pixar and its collections, live action, Disney Channel, Disney TV Animation, Disney Junior and Disney+ Originals.';
/* ---------- TMDB (main): rows made for this profile first, never empty for someone new ---------- */
const TM_FRANCHISES = ["Harry Potter and the Philosopher's Stone|2001", 'The Lord of the Rings: The Fellowship of the Ring|2001', 'Star Wars|1977', 'Jurassic Park|1993', 'The Fast and the Furious|2001',
  'Mission: Impossible|1996', 'Dr. No|1962', 'Batman Begins|2005', 'Raiders of the Lost Ark|1981', 'Back to the Future|1985', 'The Matrix|1999', 'John Wick|2014', 'Pirates of the Caribbean: The Curse of the Black Pearl|2003',
  'Toy Story|1995', 'Shrek|2001', 'The Hunger Games|2012', 'Despicable Me|2010', 'Rocky|1976', 'Alien|1979', 'Rise of the Planet of the Apes|2011', 'Transformers|2007', "Ocean's Eleven|2001", 'The Godfather|1972', 'Dune|2021'];
const TM_OSCARS = ['Anora|2024', 'Oppenheimer|2023', 'Everything Everywhere All at Once|2022', 'CODA|2021', 'Nomadland|2020', 'Parasite|2019', 'Green Book|2018', 'The Shape of Water|2017', 'Moonlight|2016',
  'Spotlight|2015', 'Birdman or (The Unexpected Virtue of Ignorance)|2014', '12 Years a Slave|2013', 'Argo|2012', 'The Artist|2011', "The King's Speech|2010", 'The Hurt Locker|2008', 'Slumdog Millionaire|2008',
  'No Country for Old Men|2007', 'The Departed|2006', 'Crash|2005', 'Million Dollar Baby|2004', 'The Lord of the Rings: The Return of the King|2003', 'Chicago|2002', 'A Beautiful Mind|2001', 'Gladiator|2000',
  'American Beauty|1999', 'Shakespeare in Love|1998', 'Titanic|1997', 'The English Patient|1996', 'Braveheart|1995'];
const TM_TV_FRANCHISES = ['Star Trek: The Next Generation|1987|tv', 'Game of Thrones|2011|tv', 'Breaking Bad|2008|tv', 'The Walking Dead|2010|tv', "Grey's Anatomy|2005|tv", 'Law & Order|1990|tv',
  'NCIS|2003|tv', 'CSI: Crime Scene Investigation|2000|tv', 'The Simpsons|1989|tv', 'Doctor Who|2005|tv', 'Pokémon|1997|tv', 'Chicago Fire|2012|tv', 'Yellowstone|2018|tv', 'American Horror Story|2011|tv', 'Stranger Things|2016|tv', 'The Office|2005|tv'];
const TM_EMMYS = ['The Pitt|2025|tv', 'Shōgun|2024|tv', 'The Bear|2022|tv', 'Hacks|2021|tv', 'Succession|2018|tv', 'Ted Lasso|2020|tv', 'The Crown|2016|tv', "Schitt's Creek|2015|tv", 'Game of Thrones|2011|tv',
  'The Marvelous Mrs. Maisel|2017|tv', "The Handmaid's Tale|2017|tv", 'Veep|2012|tv', 'Breaking Bad|2008|tv', 'Modern Family|2009|tv', 'Homeland|2011|tv', 'Mad Men|2007|tv', '30 Rock|2006|tv', 'The Sopranos|1999|tv', 'Lost|2004|tv', 'The West Wing|1999|tv'];
const tmMix = (a, b) => { const out = []; for (let i = 0; i < Math.max(a.length, b.length); i++) { if (a[i]) out.push(a[i]); if (b[i]) out.push(b[i]); } return out; };   // movie, show, movie, show…
const tmDay = () => Math.floor(Date.now() / 864e5);
TM_CATS.all = [
  {tri:true, type:'movie', id:'tm.byw1', name:'Because you watched', mine:'byw', n:0},
  {tri:true, type:'movie', id:'tm.byw2', name:'Because you watched', mine:'byw', n:1},
  {tri:true, type:'movie', id:'tm.byw3', name:'Because you watched', mine:'byw', n:2},
  {tri:true, type:'movie', id:'tm.wl',   name:'Your watchlist', mine:'wl'},
  {tri:true, type:'movie', id:'tm.rec',  name:'Recommended for you', mine:'rec'},
  {tri:true, type:'movie', id:'tm.week', name:'Popular this week', list:'/trending/all/week', mixed:true},
  {tri:true, type:'movie', id:'tm.gems', name:'Hidden gems', mine:'gems'},
  {...tmCur('tm.fran', 'Popular franchises', tmMix(TM_FRANCHISES, TM_TV_FRANCHISES)), tri:true},
  {tri:true, type:'movie', id:'tm.dec',  name:'Decades', mine:'dec'},
  {...tmCur('tm.oscar', 'Award winners · Oscars and Emmys', tmMix(TM_OSCARS, TM_EMMYS)), tri:true},
  {tri:true, type:'movie', id:'tm.new',  name:'Recently added', mine:'new'},
  {type:'movie', id:'tm.pop',  name:'Popular movies', list:'/movie/popular?region=' + TM_REGION},
  {type:'series', id:'tm.pop', name:'Popular shows', list:'/tv/popular'}
];
TM_FLAVORS.all.desc = 'Made for you: because you watched, your watchlist, recommended for you. Then popular this week, hidden gems, franchises, decades, Best Picture winners and recently added.';
/* tt id -> the TMDB entry (kept on this device) */
const tmFindMap = (() => { let m = null; return () => (m = m || lsGet('streamlet.tmfind', {})); })();
let tmFindT = 0;
async function tmIdOf(tt){
  const map = tmFindMap(); if (tt in map) return map[tt];
  let v = null;
  try { const f = await tmLimit(() => tmdbGet(`/find/${tt}?external_source=imdb_id`, tmKey())); const mv = (f.movie_results || [])[0], tv = (f.tv_results || [])[0]; v = mv ? {k:'movie', id:mv.id} : tv ? {k:'tv', id:tv.id} : null; } catch { return null; }
  map[tt] = v; clearTimeout(tmFindT); tmFindT = setTimeout(() => lsSet('streamlet.tmfind', map), 1500);
  return v;
}
const tmRecMem = new Map();
async function tmRecsOf(k, id){
  const key = k + id, hit = tmRecMem.get(key); if (hit) return hit;
  const r = await tmLimit(() => tmdbGet(`/${k}/${id}/recommendations`, tmKey())), out = (r.results || []).filter(x => x.poster_path).map(x => ({...x, media_type:x.media_type || k}));
  tmRecMem.set(key, out); return out;
}
/* what this profile watched / liked / saved, as TMDB entries (only titles with an IMDb id can be matched) */
function tmSeeds(){
  if (!profile) return {watched:[], liked:[], mine:new Set()};
  let ps; try { ps = personalSeeds(); } catch { ps = {seeds:[], mine:new Set()}; }
  const hist = histForSpace().filter(e => /^tt\d+$/.test(e.itemId)).map(e => ({id:e.itemId, name:e.name, t:e.t || 0, k:(e.itemType || e.type) === 'movie' ? 'movie' : 'tv'}));                 // this space only (unless Settings shares history across spaces)
  const movies = wdGet().filter(m => /^tt\d+$/.test(m.itemId) && mlHere(m.space)).map(m => ({id:m.itemId, name:m.name, t:m.t || 0, k:(m.type || m.itemType || 'movie') === 'movie' ? 'movie' : 'tv'}));
  const seen = new Set(), watched = [];
  for (const x of [...hist, ...movies].sort((a, b) => b.t - a.t)) if (!seen.has(x.id) && x.name) { seen.add(x.id); watched.push(x); }
  const liked = [...likeHere(), ...wlHere()].filter(e => /^tt\d+$/.test(e.itemId)).map(e => ({id:e.itemId, name:e.name, k:(e.type || e.itemType) === 'movie' ? 'movie' : 'tv'}));
  return {watched, liked, mine:new Set([...(ps.mine || []), ...seen])};
}
const tmShuffle = (arr, seed) => { const a = arr.slice(); let s = seed || 1; for (let i = a.length - 1; i > 0; i--) { s = (s * 9301 + 49297) % 233280; const j = Math.floor(s / 233280 * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const tmPid = () => { let h = 0; for (const c of String(profile ? profile.id : 'x')) h = (h * 31 + c.charCodeAt(0)) % 9973; return h; };
async function tmMine(c, extra, only){
  const S0 = tmSeeds(), S = only ? {...S0, watched:S0.watched.filter(x => x.k === only), liked:S0.liked.filter(x => x.k === only)} : S0, notMine = x => !S.mine.has(x.id);
  const kindOK = x => !only || (x.media_type || only) === only, trend = only || 'all';
  const toMetas = async list => (await Promise.all(list.map(x => tmPreview(x, x.media_type === 'tv' ? 'tv' : 'movie')))).filter(m => !S.mine.has(m.id));
  if (c.mine === 'wl') {
    return {metas:wlHere().filter(e => (e.poster || e.background) && (!only || (only === 'tv') === ((e.type || e.itemType) !== 'movie'))).map(e => ({id:e.itemId, type:e.type, name:e.name, poster:e.poster, background:e.background, releaseInfo:e.year || ''}))};
  }
  if (c.mine === 'byw') {
    // three different titles you watched lately (the pick changes each day); someone new gets "because you might like" a trending title
    const pool = tmShuffle(S.watched.slice(0, 10), tmDay() + tmPid()), seed = pool[c.n];
    if (seed) {
      const t = await tmIdOf(seed.id); if (t) { const recs = (await tmRecsOf(t.k, t.id)).filter(notMine).filter(kindOK); if (recs.length >= 4) return {name:'Because you watched ' + seed.name, metas:await toMetas(recs.slice(0, 20))}; }
    }
    const tr = await tmLimit(() => tmdbGet(`/trending/${trend}/week`, tmKey())), picks = tmShuffle((tr.results || []).map(x => ({...x, media_type:x.media_type || only})).filter(x => x.poster_path && (x.media_type === 'movie' || x.media_type === 'tv')), tmDay() + 7);
    const p = picks[c.n]; if (!p) return {metas:[]};
    const recs = (await tmRecsOf(p.media_type, p.id)).filter(notMine).filter(kindOK);
    return {name:'Because you might like ' + (p.title || p.name), metas:await toMetas(recs.slice(0, 20))};
  }
  if (c.mine === 'rec') {
    // the titles that come up across what you watched and liked, most shared first
    const seeds = [...S.watched.slice(0, 6), ...S.liked.slice(0, 4)].slice(0, 8), score = new Map();
    const lists = await Promise.all(seeds.map(async s => { const t = await tmIdOf(s.id); return t ? tmRecsOf(t.k, t.id).catch(() => []) : []; }));
    lists.forEach(l => l.forEach((x, i) => { const k = x.media_type + x.id, v = score.get(k) || {x, s:0}; v.s += 20 - Math.min(i, 19); score.set(k, v); }));
    let best = [...score.values()].sort((a, b) => b.s - a.s).map(v => v.x).filter(kindOK);
    if (best.length < 8) { const tr = await tmLimit(() => tmdbGet(`/trending/${trend}/day`, tmKey())); best = [...best, ...(tr.results || []).map(x => ({...x, media_type:x.media_type || only})).filter(x => x.poster_path && (x.media_type === 'movie' || x.media_type === 'tv'))]; }
    return {metas:(await toMetas(best.slice(0, 30))).slice(0, 20)};
  }
  const both = async (mq, tq) => {                                            // a movie query and a show query, woven together
    const none = Promise.resolve({results:[]});
    const [m, t] = await Promise.all([only === 'tv' ? none : tmLimit(() => tmdbGet(`/discover/movie?${new URLSearchParams({include_adult:'false', ...mq})}`, tmKey())), only === 'movie' ? none : tmLimit(() => tmdbGet(`/discover/tv?${new URLSearchParams({include_adult:'false', ...tq})}`, tmKey()))]);
    const pick = (r, k) => (r.results || []).filter(x => x.poster_path).map(x => ({...x, media_type:k}));
    return tmMix(pick(m, 'movie'), pick(t, 'tv'));
  };
  const today = new Date().toISOString().slice(0, 10), ago = d => new Date(Date.now() - d * 864e5).toISOString().slice(0, 10), pg = String(1 + ((tmDay() + tmPid()) % 6));
  if (c.mine === 'gems') {
    const v = {sort_by:'vote_average.desc', 'vote_average.gte':'7.3', 'vote_count.lte':'2500', page:pg};
    return {metas:await toMetas((await both({...v, 'vote_count.gte':'250'}, {...v, 'vote_count.gte':'120', 'vote_count.lte':'1500'})).slice(0, 24))};
  }
  if (c.mine === 'new') {
    const list = await both({with_release_type:'4|5', region:TM_REGION, 'release_date.lte':today, 'release_date.gte':ago(90), sort_by:'popularity.desc', 'vote_count.gte':'10'},
      {'first_air_date.lte':today, 'first_air_date.gte':ago(90), sort_by:'popularity.desc', 'vote_count.gte':'5'});
    return {metas:await toMetas(list.slice(0, 24))};
  }
  if (c.mine === 'dec') {
    // a different decade each day: its best-loved films
    const decs = [2010, 2000, 1990, 1980, 1970, 2020, 1960], d = decs[(tmDay() + tmPid()) % decs.length];
    const p3 = String(1 + (tmDay() % 3));
    const list = await both({sort_by:'vote_count.desc', 'primary_release_date.gte':d + '-01-01', 'primary_release_date.lte':(d + 9) + '-12-31', 'vote_average.gte':'6.8', page:p3},
      {sort_by:'vote_count.desc', 'first_air_date.gte':d + '-01-01', 'first_air_date.lte':(d + 9) + '-12-31', 'vote_average.gte':'7', page:p3});
    return {name:'Best of the ' + d + 's', metas:await toMetas(list.slice(0, 24))};
  }
  return {metas:[]};
}
TM_FLAVORS.marvel.desc = 'The MCU only (story order, release order, the six phases, each hero), then the rest of Marvel sorted by family: X-Men, Sony Spider-Man, Fantastic Four, Marvel Television, animation.';
/* one title from the list -> its TMDB entry (looked up once, kept on this device) */
const tmCurMap = (() => { let m = null; return () => (m = m || lsGet('streamlet.tmcur', {})); })();
let tmCurT = 0;
async function tmFind(spec){
  const [t, y, k] = spec.split('|'), kind = k === 'tv' ? 'tv' : 'movie', key = kind + '|' + t + '|' + y, map = tmCurMap();
  if (map[key]) return map[key];
  const r = await tmLimit(() => tmdbGet(`/search/${kind}?query=${enc(t.replace(/\*$/, ''))}&include_adult=false`, tmKey())), res = r.results || [];
  const norm = s => String(s || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, ''), yr = x => +String(x.release_date || x.first_air_date || '').slice(0, 4);
  const near = res.filter(x => Math.abs(yr(x) - +y) <= 1);
  const hit = near.find(x => norm(x.title || x.name) === norm(t)) || near[0] || res.find(x => norm(x.title || x.name) === norm(t));
  if (!hit) return null;
  const v = {id:hit.id, title:hit.title, name:hit.name, poster_path:hit.poster_path, backdrop_path:hit.backdrop_path, overview:hit.overview, release_date:hit.release_date, first_air_date:hit.first_air_date, vote_average:hit.vote_average, _k:kind};
  map[key] = v; clearTimeout(tmCurT); tmCurT = setTimeout(() => lsSet('streamlet.tmcur', map), 1500);
  return v;
}
async function tmCurated(c, skip, only){
  if (skip) return {metas:[]};                                            // a kept list is short: the whole of it comes back at once (rows only load their first page)
  const part = only ? c.cur.filter(s => (s.split('|')[2] === 'tv') === (only === 'tv')) : c.cur;
  const found = await Promise.all(part.map(s => tmFind(s).catch(() => null)));
  return {metas:(await Promise.all(found.filter(x => x && x.poster_path).map(x => tmPreview(x, x._k)))).filter(Boolean)};
}
const tmKey = () => lsGet('streamlet.tmdb', '');
/* at most 6 TMDB lookups at a time: a fresh Marvel space looks up a few hundred titles, and TMDB slows down past ~40 a second */
const tmSlots = {n:0, q:[]};
function tmLimit(fn){
  return new Promise((ok, no) => {
    const run = () => { tmSlots.n++; fn().then(ok, no).finally(() => { tmSlots.n--; const nx = tmSlots.q.shift(); if (nx) nx(); }); };
    if (tmSlots.n < 6) run(); else tmSlots.q.push(run);
  });
}
const tmGenres = (fl, type) => fl === 'kids' ? (type === 'movie' ? TM_KID_MG : TM_KID_TG) : Object.keys(type === 'movie' ? TM_MG : TM_TG);
const tmListName = id => (lsGet('streamlet.tmlists', {}) || {})[id] || 'TMDB list';
function tmManifest(fl){
  const lm = /^list-(\d+)$/.exec(fl);
  if (lm) return {id:'app.streamlet.tmdb.list.' + lm[1], version:'1.0.0', name:tmListName(lm[1]), description:'A TMDB list, in its own order (whoever keeps the list keeps it up to date). Needs your TMDB key.',
    resources:['catalog', {name:'meta', types:['movie', 'series'], idPrefixes:['tt', 'tmdb:']}], types:['movie', 'series'], idPrefixes:['tt', 'tmdb:'],
    catalogs:[{type:'movie', id:'ls.' + lm[1], name:tmListName(lm[1]), extra:[{name:'skip', isRequired:false}]}]};
  const f = TM_FLAVORS[fl] || TM_FLAVORS.all;
  const catalogs = (TM_CATS[fl] || TM_CATS.all).flatMap(c => c.tri ? [                                      // a Home row, then the same row for the Movies tab and for the Shows tab
      {type:'movie', id:c.id, name:c.name, extra:[], streamletTab:'home'},
      {type:'movie', id:c.id + '.m', name:c.name, extra:[], streamletTab:'tabs'},
      {type:'series', id:c.id + '.s', name:c.name, extra:[], streamletTab:'tabs'}]
    : c.tabOnly ? [{type:c.type, id:c.id, name:c.name, genres:tmGenres(fl, c.type), extra:[{name:'genre', options:tmGenres(fl, c.type), isRequired:false}, {name:'skip', isRequired:false}], streamletTab:'tabs'}]
    : [c]).map(c => c.streamletTab ? c : c.cur || c.mine || c.mixed ? {type:c.type, id:c.id, name:c.name, extra:[]}
    : {type:c.type, id:c.id, name:c.name, genres:tmGenres(fl, c.type), extra:[{name:'genre', options:tmGenres(fl, c.type), isRequired:false}, {name:'skip', isRequired:false}]});
  for (const type of ['movie', 'series']) catalogs.push({type, id:'tm.search', name:'Search', extra:[{name:'search', isRequired:true}]});
  return {id:'app.streamlet.tmdb.' + fl, version:'1.0.0', name:f.name, description:f.desc + ' Needs your TMDB key in Settings.',
    resources:['catalog', {name:'meta', types:['movie', 'series'], idPrefixes:['tt', 'tmdb:']}], types:['movie', 'series'], idPrefixes:['tt', 'tmdb:'], catalogs};
}
/* names to TMDB ids (companies, streaming services), looked up once and kept */
const tmIds = (() => { let m = null; return () => (m = m || lsGet('streamlet.tmids', {})); })();
async function tmResolve(tok){
  const ids = tmIds(); if (ids[tok]) return ids[tok];
  const [kind, name] = [tok.slice(0, tok.indexOf(':')), tok.slice(tok.indexOf(':') + 1)], low = name.toLowerCase();
  let id = '';
  if (kind === 'co') {
    const r = await tmdbGet(`/search/company?query=${enc(name)}`, tmKey()), res = r.results || [];
    const hit = res.find(x => x.name.toLowerCase() === low) || res.find(x => x.name.toLowerCase().startsWith(low)) || res[0];
    id = hit ? String(hit.id) : '';
  } else if (kind === 'kw') {
    const r = await tmdbGet(`/search/keyword?query=${enc(name)}`, tmKey()), res = r.results || [];
    const hit = res.find(x => x.name.toLowerCase() === low) || res[0];
    id = hit ? String(hit.id) : '';
  } else if (kind === 'prov') {
    const r = await tmdbGet(`/watch/providers/tv?watch_region=${TM_REGION}`, tmKey()), res = r.results || [];
    const hit = res.find(x => x.provider_name.toLowerCase() === low) || res.find(x => x.provider_name.toLowerCase().includes(low));
    id = hit ? String(hit.provider_id) : '';
  }
  if (id) { ids[tok] = id; lsSet('streamlet.tmids', ids); }
  return id;
}
async function tmParams(disc){
  const out = {};
  for (const [k, v] of Object.entries(disc)) {
    if (v === 'today') { out[k] = new Date().toISOString().slice(0, 10); continue; }
    if (/(^|[|,])(co|prov|kw):/.test(v)) {
      const parts = await Promise.all(v.split('|').map(p => /^(co|prov|kw):/.test(p) ? tmResolve(p) : p));
      const ok = parts.filter(Boolean); if (!ok.length) throw new Error('Not found on TMDB: ' + v);
      out[k] = ok.join('|');
      if (k === 'with_watch_providers') out.watch_region = TM_REGION;
    } else out[k] = v;
  }
  return out;
}
/* TMDB id -> IMDb id, kept on this device (they never change) */
const tmImdbMap = (() => { let m = null; return () => (m = m || lsGet('streamlet.tmimdb', {})); })();
let tmImdbT = 0;
async function tmImdb(kind, id){
  const map = tmImdbMap(), k = kind[0] + id;
  if (k in map) return map[k];
  let tt = '';
  try { const r = await tmLimit(() => tmdbGet(`/${kind}/${id}/external_ids`, tmKey())); tt = r.imdb_id || ''; } catch { return ''; }
  map[k] = tt; clearTimeout(tmImdbT); tmImdbT = setTimeout(() => lsSet('streamlet.tmimdb', map), 1500);
  return tt;
}
const tmYear = x => String(x.release_date || x.first_air_date || '').slice(0, 4);
async function tmPreview(x, kind){
  const tt = await tmImdb(kind, x.id);
  return {id:tt || `tmdb:${kind}:${x.id}`, type:kind === 'tv' ? 'series' : 'movie', name:x.title || x.name || '',
    poster:x.poster_path ? TM_IMG + 'w342' + x.poster_path : '', background:x.backdrop_path ? TM_IMG + 'w1280' + x.backdrop_path : '',
    description:x.overview || '', releaseInfo:tmYear(x), imdbRating:x.vote_average ? x.vote_average.toFixed(1) : undefined};
}
/* kids search: only titles in kids genres, never adult ones */
function tmKidOk(x, kind){
  if (x.adult) return false;
  const g = x.genre_ids || [];
  if (g.some(n => [27, 80, 53, 10752, 10749, 10768].includes(n))) return false;
  return kind === 'movie' ? g.includes(10751) || g.includes(16) : g.includes(10762) || g.includes(10751);
}
async function tmCatalog(fl, type, id, extra){   // id may be reassigned below (tab twins)
  const kind = type === 'series' ? 'tv' : 'movie', page = Math.floor((+extra.skip || 0) / 20) + 1;
  let r;
  if (id.startsWith('ls.')) {                                              // a TMDB list: movies and shows mixed, in the list's order
    const r2 = await tmdbGet(`/list/${id.slice(3)}?page=${page}`, tmKey());
    const items2 = (r2.items || []).filter(x => x.poster_path && (x.media_type === 'movie' || x.media_type === 'tv'));
    return {metas:await Promise.all(items2.map(x => tmPreview(x, x.media_type)))};
  }
  if (id === 'tm.search') {
    if (!extra.search) return {metas:[]};
    r = await tmdbGet(`/search/${kind}?query=${enc(extra.search)}&include_adult=false&page=${page}`, tmKey());
    if (fl === 'kids') r.results = (r.results || []).filter(x => tmKidOk(x, kind));
  } else {
    let only = null; const tw = /^(.+)\.(m|s)$/.exec(id); if (tw && (TM_CATS[fl] || []).some(x => x.id === tw[1] && x.tri)) { id = tw[1]; only = tw[2] === 'm' ? 'movie' : 'tv'; }   // the Movies / Shows tab twin of a Home row
    const c = (TM_CATS[fl] || []).find(x => x.id === id && (only || x.type === type)); if (!c) return {metas:[]};
    if (c.cur) return tmCurated(c, +extra.skip || 0, only);   // whole list in one go
    if (c.mine) return +extra.skip ? {metas:[]} : tmMine(c, extra, only);
    if (c.mixed && only) { const rm = await tmdbGet(`/trending/${only}/week?page=${page}`, tmKey()); return {metas:await Promise.all((rm.results || []).filter(x => x.poster_path).map(x => tmPreview(x, only)))}; }
    if (c.mixed) { const rm = await tmdbGet(c.list + (c.list.includes('?') ? '&' : '?') + 'page=' + page, tmKey()); return {metas:await Promise.all((rm.results || []).filter(x => x.poster_path && (x.media_type === 'movie' || x.media_type === 'tv')).map(x => tmPreview(x, x.media_type)))}; }
    const gmap = kind === 'movie' ? TM_MG : TM_TG, gid = extra.genre && gmap[extra.genre];
    if (c.list && !gid) r = await tmdbGet(c.list + (c.list.includes('?') ? '&' : '?') + 'page=' + page, tmKey());
    else {
      const p = await tmParams(c.disc || {});
      if (gid) p.with_genres = p.with_genres ? p.with_genres + ',' + gid : String(gid);
      if (c.list && /top_rated/.test(c.list)) { p.sort_by = 'vote_average.desc'; p['vote_count.gte'] = '500'; }
      const q = new URLSearchParams({sort_by:'popularity.desc', include_adult:'false', page:String(page + (c.rot ? (tmDay() % c.rot) : 0)), ...p});   // rot: a different page each day
      r = await tmdbGet(`/discover/${kind}?${q}`, tmKey());
    }
  }
  const items = (r.results || []).filter(x => x.poster_path && (x.media_type ? x.media_type === kind : true));
  return {metas:await Promise.all(items.map(x => tmPreview(x, kind)))};
}
async function tmMeta(type, id){
  const kind = type === 'series' ? 'tv' : 'movie';
  let tid;
  if (id.startsWith('tmdb:')) tid = id.split(':')[2];
  else {
    const f = await tmdbGet(`/find/${id}?external_source=imdb_id`, tmKey()), hit = (kind === 'tv' ? f.tv_results : f.movie_results) || [];
    if (!hit.length) throw new Error('Not on TMDB');
    tid = hit[0].id;
  }
  const d = await tmdbGet(`/${kind}/${tid}?append_to_response=external_ids,credits,images,videos&include_image_language=en,null`, tmKey());
  const imdb = d.imdb_id || (d.external_ids || {}).imdb_id || '', mid = id.startsWith('tt') ? id : (imdb || id);
  const logos = (d.images || {}).logos || [], logo = logos.find(l => l.iso_639_1 === 'en') || logos[0];
  const trailer = ((d.videos || {}).results || []).find(v => v.site === 'YouTube' && v.type === 'Trailer');
  const run = d.runtime || (d.episode_run_time || [])[0];
  const meta = {id:mid, type, name:d.title || d.name || '', imdb_id:imdb || undefined,
    poster:d.poster_path ? TM_IMG + 'w500' + d.poster_path : '', background:d.backdrop_path ? TM_IMG + 'original' + d.backdrop_path : '',
    logo:logo ? TM_IMG + 'w500' + logo.file_path : undefined, description:d.overview || '',
    releaseInfo:kind === 'tv' ? [tmYear(d), d.status === 'Ended' && d.last_air_date ? d.last_air_date.slice(0, 4) : ''].filter(Boolean).join('–') + (d.status === 'Ended' ? '' : '–') : tmYear(d),
    year:tmYear(d), genres:(d.genres || []).map(g => g.name), runtime:run ? run + ' min' : undefined, imdbRating:d.vote_average ? d.vote_average.toFixed(1) : undefined,
    cast:((d.credits || {}).cast || []).slice(0, 10).map(c => c.name), director:((d.credits || {}).crew || []).filter(c => c.job === 'Director').map(c => c.name),
    trailers:trailer ? [{source:trailer.key, type:'Trailer'}] : [], status:d.status, tmdbStatus:d.status || '', tmdbNext:!!d.next_episode_to_air};
  if (kind === 'tv') {
    const nums = (d.seasons || []).map(s => s.season_number), videos = [];
    for (let i = 0; i < nums.length; i += 20) {
      const chunk = nums.slice(i, i + 20), r = await tmdbGet(`/tv/${tid}?append_to_response=${chunk.map(n => 'season/' + n).join(',')}`, tmKey());
      for (const n of chunk) for (const e of ((r['season/' + n] || {}).episodes || []))
        videos.push({id:`${mid}:${n}:${e.episode_number}`, season:n, episode:e.episode_number, title:e.name || `Episode ${e.episode_number}`, name:e.name,
          released:e.air_date ? e.air_date + 'T05:00:00.000Z' : undefined, thumbnail:e.still_path ? TM_IMG + 'w500' + e.still_path : undefined, overview:e.overview || '', description:e.overview || ''});
    }
    meta.videos = videos;
  }
  return {meta};
}
const tmMineMem = new Map();
async function tmRoute(url){
  const m = /^tmdb:\/\/([^/]+)\/(.*?)(\.json)?(\?.*)?$/.exec(url); if (!m) throw new Error('Bad TMDB address');
  const fl = TM_FLAVORS[m[1]] || /^list-\d+$/.test(m[1]) ? m[1] : 'all', path = m[2];
  if (path === 'manifest') {
    const lm = /^list-(\d+)$/.exec(fl);
    if (lm && tmKey()) { try { const r = await tmdbGet(`/list/${lm[1]}?page=1`, tmKey()); const n = lsGet('streamlet.tmlists', {}) || {}; n[lm[1]] = r.name || 'TMDB list'; lsSet('streamlet.tmlists', n); } catch {} }   // the list's own name for its row
    return tmManifest(fl);
  }
  if (!tmKey()) throw new Error('Add your TMDB key in Settings to use this addon');
  const isMine = /\/catalog\/[^/]+\/tm\.(byw\d|wl|rec|dec)/.test(url);
  if (isMine) {                                                               // made for this profile: kept a few minutes, per profile, never shared
    const mk = (profile ? profile.id : '') + '|' + (cur ? cur.id : '') + '|' + url, mh = tmMineMem.get(mk);   // per profile and per space
    if (mh && Date.now() - mh.t < (url.includes('tm.wl') ? 0 : 600000)) return mh.j;
    const parts0 = path.split('/'), j0 = await tmCatalog(fl, decodeURIComponent(parts0[1]), decodeURIComponent(parts0[2]), Object.fromEntries(new URLSearchParams(parts0[3] || '')));
    tmMineMem.set(mk, {t:Date.now(), j:j0}); return j0;
  }
  const ck = url.replace(/^tmdb:\/\//, 'https://tmdb.streamlet.invalid/');      // the device cache only takes web addresses
  const hit = await dataGet(ck); if (hit && hit.age < dFresh(ck)) return hit.json;
  const parts = path.split('/').map((x, i) => i < 3 ? decodeURIComponent(x) : x);   // the extras stay encoded: a genre can hold '&'
  let j;
  try {
    if (parts[0] === 'catalog') j = await tmCatalog(fl, parts[1], parts[2], Object.fromEntries(new URLSearchParams(parts[3] || '')));
    else if (parts[0] === 'meta') j = await tmMeta(parts[1], parts[2]);
    else throw new Error('Not supported');
  } catch (e) { if (hit) return hit.json; throw e; }                     // offline or TMDB busy: the last copy is better than nothing
  dataPut(ck, j);
  return j;
}
/* installed copies always answer with the current catalog list */
for (const a of addons) if (a.url && a.url.startsWith('tmdb://')) { const fl = a.url.slice(7).split('/')[0]; a.manifest = tmManifest(TM_FLAVORS[fl] || /^list-\d+$/.test(fl) ? fl : 'all'); }
