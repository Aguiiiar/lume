// Stop first so the final playback position is saved before completion.
// Navigation may skip an unfinished episode; only the end-of-episode cue completes it.
export async function advanceEpisode(
  complete: boolean,
  stop: () => Promise<unknown>,
  markWatched: () => Promise<unknown>,
  next: () => void,
) {
  await stop();
  if (complete) await markWatched();
  next();
}
