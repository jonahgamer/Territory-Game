const KEY = "territory-contest-patch";

export function publishContestPatch(contestId, contest, serverNow) {
  if (!contestId || !contest) return;
  try {
    localStorage.setItem(KEY, JSON.stringify({
      contestId,
      nonce: Date.now(),
      serverNow: Number.isFinite(serverNow) ? serverNow : Date.now(),
      energy: contest.energy,
      claims: contest.claims,
      spawns: contest.spawns,
      spawnResolved: contest.spawnResolved,
      resolvedTeams: contest.resolvedTeams,
      spawnChoices: contest.spawnChoices,
      spawnVotes: contest.spawnVotes,
    }));
  } catch {
    // A full board can exceed the storage quota. The next poll still catches up.
  }
}

export function watchContestPatch(contestId, onPatch) {
  if (!contestId) return;
  window.addEventListener("storage", (event) => {
    if (event.key !== KEY || !event.newValue) return;
    try {
      const patch = JSON.parse(event.newValue);
      if (patch?.contestId !== contestId) return;
      onPatch(patch);
    } catch {
      // Ignore a patch this tab cannot read.
    }
  });
}
