// Preseason rankings made by league members, compared against reality.
// Matched by league name + season; teams matched by Sleeper display name (case-insensitive).

export const PRESEASON = [
  {
    league: /studs\s*and\s*spuds/i,
    season: "2026",
    by: "Zev",
    byOwner: "ZFC11",
    ranks: [
      { name: "Zev", owner: "ZFC11" },
      { name: "Casey", owner: "CassPants" },
      { name: "Clark", owner: "clarkbrooks77" },
      { name: "Greg", owner: "German1855" },
      { name: "Evans", owner: "Tbevans22" },
      { name: "Jacob", owner: "ChappyJacob" },
      { name: "Justin", owner: "JSeloc" },
      { name: "Nail", owner: "Nail024" },
      { name: "Patrick", owner: "SlayerofZev" },
      { name: "Nick", owner: "Nickmd14107" },
      { name: "Joey", owner: "jalf" },
      { name: "Pierce", owner: "PierceCrawley" },
    ],
  },
];

export const preseasonFor = (league) =>
  PRESEASON.find((p) => p.league.test(league?.name || "") && p.season === league?.season) || null;
