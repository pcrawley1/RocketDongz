// League inside jokes. Keyed by Sleeper display name (lowercase).
// Each category is optional; when present it replaces the generic line for that spot.
// Placeholders: {W} winner, {L} loser, {s} score, {N} nickname.

export const PERSONAS = {
  aafoster95: {
    nick: "Andy22",
    tag: "aka Andy22",
    loss: [
      "{N} pulled up a chair in the corner and watched {W} score all over his team.",
      "Classic {N}: front-row seat while another man did all the scoring.",
      "{W} put up points on {N}'s team while he watched. He says he's into it.",
      "{N} is in an open relationship with losing.",
      "Another week of {N} watching from the doorway.",
    ],
    win: [
      "{N} got a W? Even he looked surprised he got to participate.",
      "A rare W for {N}. Usually he just watches.",
      "{N} finally did the scoring himself for once.",
    ],
    low: [
      "{N} let the whole league take turns on his lineup.",
      "{N} scored {s}. Somewhere, Adam22 is proud.",
      "{N} just sat back and watched everyone else put up points.",
    ],
    high: ["{N} actually scored instead of watching someone else do it. Mark the calendar."],
    bench: ["{N} left points on the bench. He likes to watch them sit there."],
    standing: [
      "The 'Unlimited' is how many guys score on {N} each week.",
      "{N}'s lineup has more hall passes than starters.",
      "Unlimited losses. Unlimited watching. Classic {N}.",
      "{N} doesn't lose games, he hosts them.",
    ],
    chug: [
      "{N} has watched enough. Time to chug.",
      "{N} watches everyone else score, so the least he can do is chug.",
    ],
  },
  superforrest: {
    nick: "Forrest",
    tag: "🏈 regulation size",
    loss: [
      "{W} spiked Forrest like a football. Zev was right.",
      "Forrest got punted. Easy to do when you're regulation size.",
      "{W} threw Forrest around all day. Hard not to when he's 14 ounces.",
    ],
    win: [
      "Small but mighty. Still the size of a football, though.",
      "Pocket-sized Forrest gets the W. Somebody inflate him to 13 PSI and celebrate.",
      "Forrest wins again. Somebody spike him in the end zone.",
    ],
    high: [
      "A huge number from a guy you could throw a tight spiral with.",
      "Forrest put up {s}, about 400 times his body weight.",
    ],
    low: ["Forrest scored {s}. Small team for a small man.", "Forrest got deflated. Tom Brady is a suspect."],
    bench: ["Forrest left points on the bench. Couldn't see over the bench to notice."],
    standing: [
      "Regulation NFL football size. Zev called it.",
      "Top of the standings, bottom of the height chart.",
      "Crushing the league. Still fits in a ball bag.",
      "Could be the league's best manager, could be a fumble. Same size either way.",
    ],
    chug: [
      "Careful, Forrest. A full can is half your body weight.",
      "Forrest owes a chug. Pour it into a thimble for him.",
    ],
  },
};

export const personaFor = (owner) => PERSONAS[String(owner || "").toLowerCase()] || null;
