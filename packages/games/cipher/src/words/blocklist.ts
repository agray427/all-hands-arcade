/**
 * Words excluded from BOTH the allow list and the answer pool.
 *
 * All Hands Arcade is built for company-wide events, so slurs and crude terms
 * are removed outright rather than merely kept out of the answer pool: a
 * facilitator should not be able to set them as the secret, and a player's
 * guess should not be relayed to the host dashboard.
 *
 * Hand-maintained on purpose. Automated profanity lists over-block ordinary
 * words (a 5-letter list loses "bitch" but also "cocks", "dicks", "screw"),
 * which would make legitimate guesses fail with "This is not an allowed word"
 * and feel broken. Add entries here as they come up.
 */
export const BLOCKED_WORDS: readonly string[] = [
  'bitch',
  'chink',
  'coons',
  'cunts',
  'dagos',
  'dyke',
  'dykes',
  'fag',
  'fags',
  'gooks',
  'gyped',
  'gypos',
  'homos',
  'kikes',
  'kraut',
  'micks',
  'nigga',
  'paki',
  'pakis',
  'queer',
  'quims',
  'retar',
  'spick',
  'spics',
  'spook',
  'twats',
  'wench',
  'whore',
  'wogs',
  'wops',
].filter((word) => /^[a-z]{5}$/.test(word));
