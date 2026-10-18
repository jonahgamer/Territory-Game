// ═══════════════════════════════════════════════════════════════════
// Bootstrap
// ═══════════════════════════════════════════════════════════════════

async function bootstrap() {
  if (!isSignedIn()) {
    location.replace("/login.html");
    return;
  }

  try {
    const data = await apiCall("bootstrap");
    maps = Array.isArray(data.maps) ? data.maps : [];
    problems = Array.isArray(data.problems)
      ? data.problems.map((problem) => ({
        ...problem,
        difficulty: problemDifficulty(problem),
        prompt: problem.prompt || "",
        answer: problem.answer || "",
        logic: problem.logic || "",
      }))
      : [];
    contests = Array.isArray(data.contests) ? data.contests.map(loadedContest) : [];
    if (data.revisions) {
      for (const name of ["maps", "problems", "contests"]) {
        if (Number.isInteger(data.revisions[name])) revisions[name] = data.revisions[name];
      }
    }
    bootstrapped = true;
    loadError.hidden = true;
    noteServerTime(data.serverNow);

    if (data.user) {
      session.user = { ...session.user, ...data.user };
      if (!isAdmin()) session.user.role = "student";
      persistSession();
    }

    applyAccount();
    updateHomeLead();
    if (ROUTED) startRouter();
    else if (isContestant() && studentView) showStudent();
    else openSplitPage();
  } catch (e) {
    console.error("[bootstrap]", e);
    if (String(e.message).includes("Unauthorized")) {
      logOut();
      return;
    }
    bootstrapped = false;
    if (loadError) {
      loadError.hidden = false;
      loadError.textContent = "The game data could not be loaded, so changes will not be saved. Refresh the page to try again.";
    }
    applyAccount();
    updateHomeLead();
    if (ROUTED) startRouter();
    else if (isContestant() && studentView) showStudent();
    else openSplitPage();
  }
}

function openSplitPage() {
  if (mapsButton) return;
  if (isContestant()) {
    location.replace("/index.html");
    return;
  }
  if (location.hash === "#tutorial" && tutorialView) {
    showTutorial();
    return;
  }
  if (mapsView) showMaps();
  else if (problemsView) showProblems();
  else if (settingsView) showSettings();
}

bootstrap();

