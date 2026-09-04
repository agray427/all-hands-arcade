// The whole app is a live socket session keyed off localStorage identity, so
// there is nothing meaningful to render on the server and plenty to break.
export const ssr = false;
export const prerender = false;
