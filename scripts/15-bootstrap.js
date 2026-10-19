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
    versions = Array.isArray(data.versions) ? data.versions.map(loadedVersion) : [];
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
    else openSplitPage();
  }
  if (!ROUTED) {
    window.addEventListener("popstate", () => {
      if (bootstrapped) openSplitPage();
    });
  }
}

function openSplitPage() {
  if (!isSignedIn()) return;
  const adminPath = location.pathname.startsWith("/admin/");
  const contestant = isContestant();
  if (contestant && adminPath && !location.pathname.endsWith("/credits.html")) {
    location.replace("/index.html");
    return;
  }
  if (!contestant && !adminPath) {
    location.replace("/admin/maps.html");
    return;
  }

  const params = new URLSearchParams(location.search);
  if (contestant && studentView) {
    if (params.get("settings") && studentSettingsView) showStudentSettings();
    else if (params.get("contest")) showStudentPlay(params.get("contest"));
    else showStudent();
    return;
  }
  if (problemsView) {
    const type = params.get("type");
    const index = Number(params.get("index"));
    if (params.get("from") === "map" && params.get("map")) openMapId = params.get("map");
    if (typeInfo(type) && params.get("batch")) showProblemBatch(type);
    else if (typeInfo(type) && params.has("index") && Number.isInteger(index)) showProblemEditor(index, type, params.get("from") === "map");
    else {
      activeProblemType = typeInfo(type) ? type : null;
      showProblems();
    }
    return;
  }
  if (mapsView) {
    const mapId = params.get("map");
    if (mapId && maps.some((map) => map.id === mapId)) showEditor(mapId);
    else showMaps();
    return;
  }
  if (competitionsView) {
    const id = params.get("id");
    if (id && contests.some((contest) => contest.id === id)) showContest(id);
    else showCompetitions();
    return;
  }
  if (settingsView) showSettings();
  else if (tutorialView) showTutorial();
  else if (creditsView) showCredits();
}

bootstrap();

